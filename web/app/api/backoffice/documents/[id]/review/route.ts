import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function isColumnMissing(errMsg: string | undefined | null, col: string) {
  if (!errMsg) return false;
  const m = errMsg.toLowerCase();
  return m.includes("column") && m.includes(col.toLowerCase());
}

function parseDecision(body: any): { status: "APPROVED" | "REJECTED"; comment: string | null } | null {
  if (!body || typeof body !== "object") return null;

  if (typeof body.decision === "string") {
    const d = body.decision.toUpperCase();
    const status = d === "APPROVE" ? "APPROVED" : d === "REJECT" ? "REJECTED" : null;
    if (!status) return null;
    const c = typeof body.comment === "string" ? body.comment.trim() : "";
    return { status, comment: c.length ? c : null };
  }

  if (typeof body.status === "string") {
    const s = body.status.toUpperCase();
    if (s !== "APPROVED" && s !== "REJECTED") return null;
    const c = typeof body.comment === "string" ? body.comment.trim() : "";
    return { status: s, comment: c.length ? c : null };
  }

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

  // Buscar info do documento (para devolver o pedido à entidade, se for doc de candidatura)
  const { data: docRow } = await supabase
    .from("documents")
    .select("id, application_id, original_name")
    .eq("id", documentId)
    .single();

  // 1) Atualiza documento
  const baseUpdate: any = {
    status: parsed.status,
    review_comment: parsed.comment,
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

  // 2) Auditoria (reavaliação com histórico)
  const hist = await supabase.from("document_review_history").insert({
    document_id: documentId,
    decided_by: user.id,
    decision: parsed.status,
    comment: parsed.comment,
  });

  let warning: string | null = null;
  if (hist.error) warning = `Auditoria: ${hist.error.message}`;

  // 3) Workflow: se REJECTED -> devolver pedido à entidade (S4_RETURNED)
  if (parsed.status === "REJECTED" && docRow?.application_id) {
    const appId = docRow.application_id as string;

    const { data: app } = await supabase
      .from("applications")
      .select("id, current_status")
      .eq("id", appId)
      .single();

    const fromStatus = app?.current_status ?? null;

    // Só muda se ainda não estiver retornado
    if (fromStatus !== "S4_RETURNED") {
      const aup = await supabase.from("applications").update({ current_status: "S4_RETURNED" }).eq("id", appId);
      if (aup.error) {
        warning = (warning ? `${warning} | ` : "") + `Estado pedido: ${aup.error.message}`;
      } else {
        const comment = `Documento rejeitado: ${docRow.original_name ?? documentId}${
          parsed.comment ? ` — ${parsed.comment}` : ""
        }`;

        const insH = await supabase.from("application_status_history").insert({
          application_id: appId,
          from_status: fromStatus,
          to_status: "S4_RETURNED",
          comment,
        });

        if (insH.error) {
          warning = (warning ? `${warning} | ` : "") + `Histórico estado: ${insH.error.message}`;
        }
      }
    }
  }

  return NextResponse.json(warning ? { ok: true, warning } : { ok: true });
}
