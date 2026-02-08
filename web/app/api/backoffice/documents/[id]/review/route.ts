import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional().nullable(),
});

function isColumnMissing(errMsg: string | undefined | null, col: string) {
  if (!errMsg) return false;
  const m = errMsg.toLowerCase();
  return m.includes("column") && m.includes(col.toLowerCase());
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  // TECH ou ADMIN pode rever (ajusta se também quiseres PRESIDENT)
  const isTech = await supabase.rpc("has_role", { role: "TECH" });
  const isAdmin = await supabase.rpc("has_role", { role: "ADMIN" });
  if (isTech.data !== true && isAdmin.data !== true) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const status = parsed.data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const comment = (parsed.data.comment ?? "").trim();
  if (status === "REJECTED" && comment.length === 0) {
    return NextResponse.json({ ok: false, error: "Comentário obrigatório na rejeição." }, { status: 400 });
  }

  // tentar update com colunas de auditoria (se existirem)
  const baseUpdate: any = {
    status,
    review_comment: comment.length ? comment : null,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };

  let up = await supabase.from("documents").update(baseUpdate).eq("id", documentId);

  if (up.error && isColumnMissing(up.error.message, "reviewed_by")) {
    delete baseUpdate.reviewed_by;
    up = await supabase.from("documents").update(baseUpdate).eq("id", documentId);
  }
  if (up.error && isColumnMissing(up.error.message, "reviewed_at")) {
    delete baseUpdate.reviewed_at;
    up = await supabase.from("documents").update(baseUpdate).eq("id", documentId);
  }

  if (up.error) {
    return NextResponse.json({ ok: false, error: up.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
