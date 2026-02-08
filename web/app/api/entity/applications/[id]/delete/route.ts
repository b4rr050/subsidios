import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isColumnMissing(errMsg: string | undefined | null, col: string) {
  if (!errMsg) return false;
  const m = errMsg.toLowerCase();
  return m.includes("column") && m.includes(col.toLowerCase());
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: appId } = await ctx.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const role = await supabase.rpc("has_role", { role: "ENTITY" });
  if (role.data !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.entity_id) {
    return NextResponse.json({ ok: false, error: "Missing entity profile" }, { status: 400 });
  }

  const entityId = profile.entity_id;

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, current_status, is_deleted")
    .eq("id", appId)
    .single();

  if (appErr || !app || app.is_deleted) {
    return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
  }

  if (app.entity_id !== entityId) {
    return NextResponse.json({ ok: false, error: "Forbidden (wrong entity)" }, { status: 403 });
  }

  if (app.current_status !== "S1_DRAFT") {
    return NextResponse.json({ ok: false, error: "Só é possível eliminar pedidos em rascunho (S1_DRAFT)." }, { status: 409 });
  }

  const update: any = {
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: user.id,
  };

  let up = await supabase.from("applications").update(update).eq("id", appId);

  // compatibilidade se não tiver deleted_by/deleted_at
  if (up.error && isColumnMissing(up.error.message, "deleted_by")) {
    delete update.deleted_by;
    up = await supabase.from("applications").update(update).eq("id", appId);
  }
  if (up.error && isColumnMissing(up.error.message, "deleted_at")) {
    delete update.deleted_at;
    up = await supabase.from("applications").update(update).eq("id", appId);
  }

  if (up.error) {
    return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
