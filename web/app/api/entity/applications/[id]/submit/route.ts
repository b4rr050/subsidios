import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUBMITTABLE = new Set(["S1_DRAFT", "S4_RETURNED"]);

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { data: isEntity } = await supabase.rpc("has_role", { role: "ENTITY" });
  if (isEntity !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.entity_id) return NextResponse.json({ ok: false, error: "No entity linked" }, { status: 400 });

  const appId = ctx.params.id;

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, current_status")
    .eq("id", appId)
    .single();

  if (appErr || !app) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (app.entity_id !== profile.entity_id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  if (!SUBMITTABLE.has(app.current_status)) {
    return NextResponse.json({ ok: false, error: "Pedido não pode ser submetido neste estado." }, { status: 409 });
  }

  // Atualiza estado
  const nextStatus = "S2_SUBMITTED";

  const upd = await supabase
    .from("applications")
    .update({
      current_status: nextStatus,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", appId);

  if (upd.error) return NextResponse.json({ ok: false, error: upd.error.message }, { status: 500 });

  // Regista histórico
  const hist = await supabase.from("application_status_history").insert({
    application_id: appId,
    from_status: app.current_status,
    to_status: nextStatus,
    changed_by: userData.user.id,
    comment: "Submetido pela entidade.",
  });

  if (hist.error) {
    // não bloqueamos o fluxo por falha de histórico, mas devolvemos aviso
    return NextResponse.json({ ok: true, warning: "Status updated but history insert failed" });
  }

  return NextResponse.json({ ok: true });
}
