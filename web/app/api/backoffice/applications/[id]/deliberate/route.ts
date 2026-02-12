import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParamsPromise = Promise<{ id: string }>;

async function isTechOrAdmin() {
  const supabase = await createClient();
  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  return a.data === true || t.data === true;
}

function asInt(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function asNum(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function buildEmail({
  entityName,
  applicationTitle,
  meetingDate,
  outcome,
  votesFor,
  votesAgainst,
  votesAbstain,
  approvedAmount,
}: {
  entityName: string;
  applicationTitle: string;
  meetingDate: string;
  outcome: "APPROVED" | "REJECTED";
  votesFor: number | null;
  votesAgainst: number | null;
  votesAbstain: number | null;
  approvedAmount: number | null;
}) {
  const datePt = meetingDate;

  const voting =
    outcome === "APPROVED"
      ? votesFor || votesAgainst || votesAbstain
        ? `Aprovado em Reunião de Câmara de ${datePt}, com votação: ${votesFor ?? "-"} a favor, ${votesAgainst ?? "-"} contra, ${votesAbstain ?? "-"} abstenções.`
        : `Aprovado em Reunião de Câmara de ${datePt}.`
      : votesFor || votesAgainst || votesAbstain
        ? `Rejeitado em Reunião de Câmara de ${datePt}, com votação: ${votesFor ?? "-"} a favor, ${votesAgainst ?? "-"} contra, ${votesAbstain ?? "-"} abstenções.`
        : `Rejeitado em Reunião de Câmara de ${datePt}.`;

  const amountLine =
    outcome === "APPROVED" && approvedAmount != null ? `\n\nValor aprovado: ${approvedAmount.toFixed(2)} €` : "";

  const next =
    outcome === "APPROVED"
      ? `\n\nO processo encontra-se agora na fase de execução financeira, aguardando a submissão dos documentos comprovativos de despesa (faturas/recibos e demais elementos necessários) para validação técnica e posterior encaminhamento para o serviço financeiro.`
      : `\n\nO processo será encerrado nos termos da deliberação tomada.`;

  const subject =
    outcome === "APPROVED"
      ? `Deliberação do Pedido de Apoio – ${applicationTitle}`
      : `Deliberação do Pedido – ${applicationTitle}`;

  const text = `Caro(a) ${entityName},

${voting}${amountLine}${next}

Com os melhores cumprimentos,
Câmara Municipal de Barcelos`;

  return { subject, text };
}

async function sendEmailResend(to: string[], subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL;

  if (!key || !from) {
    return { ok: false, warning: "Email não enviado: define RESEND_API_KEY e FROM_EMAIL no Vercel." };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, warning: `Email não enviado (Resend): ${res.status} ${t}` };
  }

  return { ok: true };
}

async function insertHistorySafe(supabase: any, rowWithActor: any, rowWithoutActor: any) {
  // tenta com changed_by / actor; se falhar, tenta sem
  const attempt1 = await supabase.from("application_status_history").insert(rowWithActor);
  if (!attempt1?.error) return { ok: true };

  const attempt2 = await supabase.from("application_status_history").insert(rowWithoutActor);
  if (!attempt2?.error) return { ok: true, warning: attempt1.error?.message ?? "Falhou insert com changed_by; inserido sem changed_by." };

  return { ok: false, error: attempt2.error?.message ?? attempt1.error?.message ?? "Falha ao inserir histórico." };
}

export async function POST(req: Request, ctx: { params: ParamsPromise }) {
  if (!(await isTechOrAdmin())) {
    return NextResponse.json({ ok: false, error: "Sem permissões." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const meeting_date = typeof body?.meeting_date === "string" ? body.meeting_date : null; // YYYY-MM-DD
  const outcome = body?.outcome === "APPROVED" || body?.outcome === "REJECTED" ? body.outcome : null;

  const votes_for = asInt(body?.votes_for);
  const votes_against = asInt(body?.votes_against);
  const votes_abstain = asInt(body?.votes_abstain);

  const voting_notes = typeof body?.voting_notes === "string" ? body.voting_notes.trim() : null;
  const deliberation_notes = typeof body?.deliberation_notes === "string" ? body.deliberation_notes.trim() : null;

  const approved_amount = asNum(body?.approved_amount);
  const notify_entity = body?.notify_entity === true;

  if (!meeting_date) return NextResponse.json({ ok: false, error: "meeting_date é obrigatório (YYYY-MM-DD)." }, { status: 400 });
  if (!outcome) return NextResponse.json({ ok: false, error: "outcome tem de ser APPROVED ou REJECTED." }, { status: 400 });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  const actorId = me?.id ?? user.id;

  // Pedido tem de estar enviado a reunião
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, object_title, current_status, approved_amount")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (appErr || !app) {
    return NextResponse.json({ ok: false, error: appErr?.message ?? "Pedido não encontrado." }, { status: 404 });
  }

  if (app.current_status !== "S8_SENT_TO_MEETING") {
    return NextResponse.json(
      { ok: false, error: `Estado inválido para deliberação: ${app.current_status}. Esperado: S8_SENT_TO_MEETING.` },
      { status: 400 }
    );
  }

  // Entidade (nome/nif)
  const { data: ent } = await supabase.from("entities").select("id,name,nif").eq("id", app.entity_id).single();

  // 1) Guardar deliberação
  const { error: delErr } = await supabase.from("meeting_deliberations").upsert({
    application_id: id,
    meeting_date,
    outcome,
    votes_for,
    votes_against,
    votes_abstain,
    voting_notes: voting_notes || null,
    approved_amount: approved_amount,
    deliberation_notes: deliberation_notes || null,
    deliberated_by: actorId,
    deliberated_at: new Date().toISOString(),
  });

  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 400 });

  // 2) Atualizar estado para S9_DELIBERATED
  const { error: up1 } = await supabase
    .from("applications")
    .update({
      current_status: "S9_DELIBERATED",
      approved_amount: approved_amount ?? app.approved_amount ?? null,
    })
    .eq("id", id);

  if (up1) return NextResponse.json({ ok: false, error: up1.message }, { status: 400 });

  // Histórico 1
  const h1 = await insertHistorySafe(
    supabase,
    {
      application_id: id,
      from_status: "S8_SENT_TO_MEETING",
      to_status: "S9_DELIBERATED",
      comment: `Deliberação registada (resultado: ${outcome}).`,
      changed_by: actorId,
    },
    {
      application_id: id,
      from_status: "S8_SENT_TO_MEETING",
      to_status: "S9_DELIBERATED",
      comment: `Deliberação registada (resultado: ${outcome}).`,
    }
  );

  // 3) Estado final após deliberação
  const finalStatus = outcome === "APPROVED" ? "S10_AWAITING_EXPENSE" : "S15_CLOSED";

  const { error: up2 } = await supabase.from("applications").update({ current_status: finalStatus }).eq("id", id);
  if (up2) return NextResponse.json({ ok: false, error: up2.message }, { status: 400 });

  // Histórico 2
  const h2 = await insertHistorySafe(
    supabase,
    {
      application_id: id,
      from_status: "S9_DELIBERATED",
      to_status: finalStatus,
      comment: outcome === "APPROVED" ? "Pedido aprovado e a aguardar documentos de despesa." : "Pedido rejeitado e encerrado.",
      changed_by: actorId,
    },
    {
      application_id: id,
      from_status: "S9_DELIBERATED",
      to_status: finalStatus,
      comment: outcome === "APPROVED" ? "Pedido aprovado e a aguardar documentos de despesa." : "Pedido rejeitado e encerrado.",
    }
  );

  // 4) Email (opcional)
  let warning: string | null = null;

  if (!h1.ok) warning = `Aviso histórico (1): ${h1.error}`;
  if (!h2.ok) warning = `${warning ? warning + " | " : ""}Aviso histórico (2): ${h2.error}`;
  if (h1.ok && (h1 as any).warning) warning = (h1 as any).warning;
  if (h2.ok && (h2 as any).warning) warning = `${warning ? warning + " | " : ""}${(h2 as any).warning}`;

  if (notify_entity) {
    const { data: emailsRows } = await supabase
      .from("profiles")
      .select("email")
      .eq("entity_id", app.entity_id)
      .eq("is_active", true);

    const recipients = Array.from(new Set((emailsRows ?? []).map((r: any) => String(r.email ?? "").trim()).filter(Boolean)));

    if (recipients.length === 0) {
      warning = `${warning ? warning + " | " : ""}Sem emails associados à entidade (profiles.email).`;
    } else {
      const { subject, text } = buildEmail({
        entityName: ent?.name ?? "Entidade",
        applicationTitle: app.object_title ?? "Pedido",
        meetingDate: meeting_date,
        outcome,
        votesFor: votes_for,
        votesAgainst: votes_against,
        votesAbstain: votes_abstain,
        approvedAmount: approved_amount,
      });

      const sent = await sendEmailResend(recipients, subject, text);
      if (!sent.ok) warning = `${warning ? warning + " | " : ""}${sent.warning ?? "Falha no envio de email."}`;
    }
  }

  return NextResponse.json({ ok: true, finalStatus, warning });
}
