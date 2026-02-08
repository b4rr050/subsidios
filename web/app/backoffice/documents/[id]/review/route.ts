import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: docId } = await ctx.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  if (a.data !== true && t.data !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const { data: doc, error: docErr } = await supabase
    .from("documents")
    .select("id, status, is_deleted")
    .eq("id", docId)
    .single();

  if (docErr || !doc || doc.is_deleted) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (doc.status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "Este documento já foi revisto." }, { status: 409 });
  }

  const upd = await supabase
    .from("documents")
    .update({
      status: parsed.data.decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_comment: parsed.data.comment ?? null,
    })
    .eq("id", docId);

  if (upd.error) return NextResponse.json({ ok: false, error: upd.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
