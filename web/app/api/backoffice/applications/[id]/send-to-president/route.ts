import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParamsPromise = Promise<{ id: string }>;

async function isTechOrAdmin() {
  const supabase = await createClient();
  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  return a.data === true || t.data === true;
}

export async function POST(_req: Request, ctx: { params: ParamsPromise }) {
  if (!(await isTechOrAdmin())) {
    return NextResponse.json({ ok: false, error: "Sem permissões." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  // quem está a fazer a ação (profiles.id = auth.users.id)
  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  const actorId = me?.id ?? user.id;

  // buscar estado atual
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, current_status")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (appErr || !app) {
    return NextResponse.json({ ok: false, error: appErr?.message ?? "Pedido não encontrado." }, { status: 404 });
  }

  // só faz sentido a partir de S5_TECH_VALIDATED
  if (app.current_status !== "S5_TECH_VALIDATED") {
    return NextResponse.json(
      { ok: false, error: `Estado inválido para enviar ao Presidente: ${app.current_status}` },
      { status: 400 }
    );
  }

  // atualizar pedido
  const { error: upErr } = await supabase
    .from("applications")
    .update({ current_status: "S6_READY_FOR_PRESIDENT" })
    .eq("id", id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  // gravar histórico
  const { error: histErr } = await supabase.from("application_status_history").insert({
    application_id: id,
    from_status: "S5_TECH_VALIDATED",
    to_status: "S6_READY_FOR_PRESIDENT",
    comment: "Enviado ao Presidente para decisão.",
    changed_by: actorId,
  } as any);

  // se o teu schema não tiver changed_by, não queremos rebentar
  if (histErr) {
    // tenta sem changed_by
    await supabase.from("application_status_history").insert({
      application_id: id,
      from_status: "S5_TECH_VALIDATED",
      to_status: "S6_READY_FOR_PRESIDENT",
      comment: "Enviado ao Presidente para decisão.",
    } as any);
  }

  return NextResponse.json({ ok: true });
}
