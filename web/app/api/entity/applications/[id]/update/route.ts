import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/text";

const BodySchema = z.object({
  category_id: z.string().uuid(),
  object_title: z.string().min(3),
  requested_amount: z.coerce.number().min(0),
});

const EDITABLE = new Set(["S1_DRAFT", "S2_SUBMITTED", "S3_IN_REVIEW", "S4_RETURNED"]);

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { data: isEntity } = await supabase.rpc("has_role", { role: "ENTITY" });
  if (isEntity !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

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

  if (!EDITABLE.has(app.current_status)) {
    return NextResponse.json({ ok: false, error: "Pedido não permite edição neste estado." }, { status: 409 });
  }

  const { category_id, object_title, requested_amount } = parsed.data;

  const upd = await supabase
    .from("applications")
    .update({
      category_id,
      object_title,
      object_normalized: normalizeText(object_title),
      requested_amount,
    })
    .eq("id", appId);

  if (upd.error) return NextResponse.json({ ok: false, error: upd.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
