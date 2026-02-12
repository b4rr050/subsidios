import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParamsPromise = Promise<{ id: string }>;

async function isPresident() {
  const supabase = await createClient();
  const p = await supabase.rpc("has_role", { role: "PRESIDENT" });
  return p.data === true;
}

export async function POST(req: Request, ctx: { params: ParamsPromise }) {
  if (!(await isPresident())) return NextResponse.json({ ok: false, error: "Sem permissões." }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const comment = typeof body?.comment === "string" ? body.comment.trim() : null;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  const actorId = me?.id ?? user.id;

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, current_status")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (appErr || !app) return NextResponse.json({ ok: false, error: appErr?.message ?? "Pedido não encontrado." }, { status: 404 });

  if (app.current_status !== "S6_READY_FOR_PRESIDENT") {
    return NextResponse.json({ ok: false, error: `Estado inválido: ${app.current_status}` }, { status: 400 });
  }

  // 1) registar decisão do Presidente
  const { error: decErr } = await supabase.from("president_decisions").upsert({
    application_id: id,
    decision: "APPROVE_TO_PROCEED",
    comment: comment || null,
    decided_by: actorId,
    decided_at: new Date().toISOString(),
  });

  if (decErr) return NextResponse.json({ ok: false, error: decErr.message }, { status: 400 });

  // 2) atualizar estado para "enviado a reunião"
  const { error: upErr } = await supabase
    .from("applications")
    .update({ current_status: "S8_SENT_TO_MEETING" })
    .eq("id", id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  // 3) histórico
  await supabase.from("application_status_history").insert({
    application_id: id,
    from_status: "S6_READY_FOR_PRESIDENT",
    to_status: "S8_SENT_TO_MEETING",
    comment: "Aprovado pelo Presidente e enviado a Reunião de Câmara.",
    changed_by: actorId,
  } as any).catch(async () => {
    await supabase.from("application_status_history").insert({
      application_id: id,
      from_status: "S6_READY_FOR_PRESIDENT",
      to_status: "S8_SENT_TO_MEETING",
      comment: "Aprovado pelo Presidente e enviado a Reunião de Câmara.",
    } as any);
  });

  return NextResponse.json({ ok: true });
}
