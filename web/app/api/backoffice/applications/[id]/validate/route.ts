import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: appId } = await ctx.params;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  if (a.data !== true && t.data !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const comment = typeof body?.comment === "string" ? body.comment : null;

  const { data: app } = await supabase.from("applications").select("id,current_status").eq("id", appId).single();
  if (!app) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (app.current_status !== "S3_IN_REVIEW" && app.current_status !== "S4_RETURNED") {
    return NextResponse.json({ ok: false, error: "Validar só é permitido em S3_IN_REVIEW ou S4_RETURNED." }, { status: 409 });
  }

  const nextStatus = "S5_TECH_VALIDATED";

  const upd = await supabase.from("applications").update({ current_status: nextStatus }).eq("id", appId);
  if (upd.error) return NextResponse.json({ ok: false, error: upd.error.message }, { status: 500 });

  await supabase.from("application_status_history").insert({
    application_id: appId,
    from_status: app.current_status,
    to_status: nextStatus,
    changed_by: userData.user.id,
    comment: comment || "Validado tecnicamente.",
  });

  return NextResponse.json({ ok: true });
}
