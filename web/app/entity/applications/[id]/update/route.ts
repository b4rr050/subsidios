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

function toText(v: unknown) {
  if (v === null || v === undefined) return null;
  return String(v);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: appId } = await ctx.params;

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

  // Buscar dados atuais do pedido
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, current_status, category_id, object_title, requested_amount")
    .eq("id", appId)
    .single();

  if (appErr || !app) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (app.entity_id !== profile.entity_id) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  if (!EDITABLE.has(app.current_status)) {
    return NextResponse.json({ ok: false, error: "Pedido não permite edição neste estado." }, { status: 409 });
  }

  const { category_id, object_title, requested_amount } = parsed.data;

  // Atualizar
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

  // Gerar diffs (só grava se mudou)
  const changes: Array<{ field: string; old_value: string | null; new_value: string | null }> = [];

  if (app.category_id !== category_id) {
    changes.push({ field: "category_id", old_value: toText(app.category_id), new_value: toText(category_id) });
  }
  if (app.object_title !== object_title) {
    changes.push({ field: "object_title", old_value: toText(app.object_title), new_value: toText(object_title) });
  }

  // requested_amount pode vir como number; comparar com cuidado
  const oldAmt = app.requested_amount ?? 0;
  const newAmt = requested_amount ?? 0;
  if (Number(oldAmt) !== Number(newAmt)) {
    changes.push({ field: "requested_amount", old_value: toText(oldAmt), new_value: toText(newAmt) });
  }

  if (changes.length > 0) {
    const ins = await supabase.from("application_change_log").insert(
      changes.map((c) => ({
        application_id: appId,
        changed_by: userData.user!.id,
        field: c.field,
        old_value: c.old_value,
        new_value: c.new_value,
      }))
    );

    // não bloqueamos a alteração caso o log falhe, mas devolvemos aviso
    if (ins.error) {
      return NextResponse.json({ ok: true, warning: "Updated but change log insert failed" });
    }
  }

  return NextResponse.json({ ok: true });
}
