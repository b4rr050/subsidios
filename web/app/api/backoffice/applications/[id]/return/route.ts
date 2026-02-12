import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ParamsPromise = Promise<{ id: string }>;

async function isTechOrAdmin() {
  const supabase = await createClient();
  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  return a.data === true || t.data === true;
}

async function insertHistorySafe(supabase: any, rowWithActor: any, rowWithoutActor: any) {
  const attempt1 = await supabase.from("application_status_history").insert(rowWithActor);
  if (!attempt1?.error) return { ok: true };
  const attempt2 = await supabase.from("application_status_history").insert(rowWithoutActor);
  if (!attempt2?.error) return { ok: true, warning: attempt1.error?.message ?? "Inserido sem changed_by." };
  return { ok: false, error: attempt2.error?.message ?? attempt1.error?.message ?? "Falha ao inserir histórico." };
}

export async function POST(req: Request, ctx: { params: ParamsPromise }) {
  if (!(await isTechOrAdmin())) {
    return NextResponse.json({ ok: false, error: "Sem permissões." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason ?? "").trim();

  if (!reason) {
    return NextResponse.json({ ok: false, error: "Motivo é obrigatório." }, { status: 400 });
  }

  const { id } = await ctx.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("id").eq("id", user.id).single();
  const actorId = me?.id ?? user.id;

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id,current_status,is_deleted")
    .eq("id", id)
    .single();

  if (appErr || !app) return NextResponse.json({ ok: false, error: appErr?.message ?? "Pedido não encontrado." }, { status: 404 });
  if (app.is_deleted) return NextResponse.json({ ok: false, error: "Pedido eliminado." }, { status: 400 });

  // devolução faz sentido em revisão (e até depois de validado, se quiseres)
  const allowed = app.current_status === "S3_IN_REVIEW" || app.current_status === "S5_TECH_VALIDATED";
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: `Estado inválido: ${app.current_status}. Esperado: S3_IN_REVIEW ou S5_TECH_VALIDATED.` },
      { status: 400 }
    );
  }

  const from = app.current_status;

  const { error: upErr } = await supabase
    .from("applications")
    .update({
      current_status: "S4_RETURNED",
    })
    .eq("id", id);

  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });

  const h = await insertHistorySafe(
    supabase,
    {
      application_id: id,
      from_status: from,
      to_status: "S4_RETURNED",
      comment: reason,
      changed_by: actorId,
    },
    {
      application_id: id,
      from_status: from,
      to_status: "S4_RETURNED",
      comment: reason,
    }
  );

  return NextResponse.json({ ok: true, warning: h.ok ? (h as any).warning ?? null : h.error ?? null });
}
