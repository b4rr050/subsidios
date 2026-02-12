import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParamsPromise = Promise<{ id: string }>;

async function isPresident() {
  const supabase = await createClient();
  const p = await supabase.rpc("has_role", { role: "PRESIDENT" });
  return p.data === true;
}

async function insertHistorySafe(supabase: any, rowWithActor: any, rowWithoutActor: any) {
  const attempt1 = await supabase.from("application_status_history").insert(rowWithActor);
  if (!attempt1?.error) return { ok: true };

  const attempt2 = await supabase.from("application_status_history").insert(rowWithoutActor);
  if (!attempt2?.error) return { ok: true, warning: attempt1.error?.message ?? "Falhou insert com changed_by; inserido sem changed_by." };

  return { ok: false, error: attempt2.error?.message ?? attempt1.error?.message ?? "Falha ao inserir histórico." };
}

export async function POST(_req: Request, ctx: { params: ParamsPromise }) {
  if (!(await isPresident())) {
    return NextResponse.json({ ok: false, error: "Sem permissões." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  const actorId = me?.id ?? user.id;

  // Validar estado atual
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id,current_status,is_deleted")
    .eq("id", id)
    .single();

  if (appErr || !app) return NextResponse.json({ ok: false, error: appErr?.message ?? "Pedido não encontrado." }, { status: 404 });
  if (app.is_deleted) return NextResponse.json({ ok: false, error: "Pedido eliminado." }, { status: 400 });

  // ✅ O Presidente só aprova quando está "pronto para presidente"
  if (app.current_status !== "S6_READY_FOR_PRESIDENT") {
    return NextResponse.json(
      { ok: false, error: `Estado inválido: ${app.current_status}. Esperado: S6_READY_FOR_PRESIDENT.` },
      { status: 400 }
    );
  }

  // 1) Registar decisão do Presidente
  const { error: decErr } = await supabase.from("president_decisions").upsert({
    application_id: id,
    decision: "APPROVE_TO_PROCEED",
    comment: null,
    decided_by: actorId,
    decided_at: new Date().toISOString(),
  });

  if (decErr) return NextResponse.json({ ok: false, error: decErr.message }, { status: 400 });

  // 2) Atualizar estado do pedido: enviado a reunião
  const { error: upErr } = await supabase
    .from("applications")
    .update({
      current_status: "S8_SENT_TO_MEETING",
      sent_to_meeting_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  // 3) Histórico (sem .catch)
  const h = await insertHistorySafe(
    supabase,
    {
      application_id: id,
      from_status: "S6_READY_FOR_PRESIDENT",
      to_status: "S8_SENT_TO_MEETING",
      comment: "Aprovado pelo Presidente e enviado a Reunião de Câmara.",
      changed_by: actorId,
    },
    {
      application_id: id,
      from_status: "S6_READY_FOR_PRESIDENT",
      to_status: "S8_SENT_TO_MEETING",
      comment: "Aprovado pelo Presidente e enviado a Reunião de Câmara.",
    }
  );

  return NextResponse.json({
    ok: true,
    warning: h.ok ? (h as any).warning ?? null : h.error ?? "Falha ao inserir histórico.",
  });
}
