import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isColumnMissing(errMsg: string | undefined | null, col: string) {
  if (!errMsg) return false;
  const m = errMsg.toLowerCase();
  return m.includes("column") && m.includes(col.toLowerCase());
}

function parseDecision(body: any): { status: "APPROVED" | "REJECTED"; comment: string | null } | null {
  if (!body || typeof body !== "object") return null;

  // { decision: "APPROVE" | "REJECT", comment? }
  if (typeof body.decision === "string") {
    const d = body.decision.toUpperCase();
    const status = d === "APPROVE" ? "APPROVED" : d === "REJECT" ? "REJECTED" : null;
    if (!status) return null;
    const c = typeof body.comment === "string" ? body.comment.trim() : "";
    return { status, comment: c.length ? c : null };
  }

  // { status: "APPROVED" | "REJECTED", comment? }
  if (typeof body.status === "string") {
    const s = body.status.toUpperCase();
    if (s !== "APPROVED" && s !== "REJECTED") return null;
    const c = typeof body.comment === "string" ? body.comment.trim() : "";
    return { status: s, comment: c.length ? c : null };
  }

  // { approve: true } / { reject: true }
  if (body.approve === true) return { status: "APPROVED", comment: null };
  if (body.reject === true) {
    const c = typeof body.comment === "string" ? body.comment.trim() : "";
    return { status: "REJECTED", comment: c.length ? c : null };
  }

  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  // TECH ou ADMIN
  const isTech = await supabase.rpc("has_role", { role: "TECH" });
  const isAdmin = await supabase.rpc("has_role", { role: "ADMIN" });
  if (isTech.data !== true && isAdmin.data !== true) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = parseDecision(body);

  if (!parsed) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Payload inválido. Envia {decision:'APPROVE'|'REJECT', comment?} ou {status:'APPROVED'|'REJECTED', comment?}.",
      },
      { status: 400 }
    );
  }

  if (parsed.status === "REJECTED" && (!parsed.comment || parsed.comment.trim().length === 0)) {
    return NextResponse.json({ ok: false, error: "Comentário obrigatório na rejeição." }, { status: 400 });
  }

  // 1) Atualiza o documento (estado atual)
  const baseUpdate: any = {
    status: parsed.status,
    review_comment: parsed.comment,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  };

  let up = await supabase.from("documents").update(baseUpdate).eq("id", documentId);

  // compatibilidade com schemas que não têm estas colunas
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

  // 2) Inserir auditoria SEMPRE (isto permite reavaliação com histórico)
  const hist = await supabase.from("document_review_history").insert({
    document_id: documentId,
    decided_by: user.id,
    decision: parsed.status,
    comment: parsed.comment,
  });

  if (hist.error) {
    // não bloqueio o fluxo (o doc já foi atualizado), mas devolvo aviso
    return NextResponse.json({ ok: true, warning: hist.error.message });
  }

  return NextResponse.json({ ok: true });
}
