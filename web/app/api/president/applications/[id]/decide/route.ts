import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const supabase = await createClient();

  const { data: isPres } = await supabase.rpc("has_role", { role: "PRESIDENT" });
  if (isPres !== true) return NextResponse.json({ ok: false, error: "Sem permissões." }, { status: 403 });

  const { id: applicationId } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const decisionRaw = String(body?.decision ?? "").trim().toUpperCase();
  const commentRaw = body?.comment == null ? null : String(body.comment);

  const decision =
    decisionRaw === "APPROVE_TO_PROCEED" || decisionRaw === "RETURN_FOR_CORRECTION" ? decisionRaw : null;

  if (!decision) {
    return NextResponse.json(
      { ok: false, error: "Decisão inválida. Usa APPROVE_TO_PROCEED ou RETURN_FOR_CORRECTION." },
      { status: 400 }
    );
  }

  const comment = commentRaw?.trim() ? commentRaw.trim() : null;

  if (decision === "RETURN_FOR_CORRECTION" && !comment) {
    return NextResponse.json({ ok: false, error: "Comentário obrigatório ao devolver." }, { status: 400 });
  }

  // Garantir sessão
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Sessão inválida." }, { status: 401 });

  // Só permitir decidir quando o pedido está pronto para Presidente
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, current_status, is_deleted")
    .eq("id", applicationId)
    .single();

  if (appErr || !app) return NextResponse.json({ ok: false, error: "Pedido não encontrado." }, { status: 404 });
  if (app.is_deleted) return NextResponse.json({ ok: false, error: "Pedido eliminado." }, { status: 400 });

  if (app.current_status !== "S6_READY_FOR_PRESIDENT") {
    return NextResponse.json(
      { ok: false, error: "O Presidente só pode decidir pedidos em S6_READY_FOR_PRESIDENT." },
      { status: 400 }
    );
  }

  // Upsert para permitir reavaliação (mantemos 1 registo por pedido, mas pode ser atualizado)
  const { error: upErr } = await supabase
    .from("president_decisions")
    .upsert(
      {
        application_id: applicationId,
        decision,
        comment,
        decided_by: user.id, // profiles.id == auth.users.id no teu schema
      },
      { onConflict: "application_id" }
    );

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  // O trigger trata do update do applications.current_status
  return NextResponse.json({ ok: true });
}
