import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    if (!(await isEntityUser())) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const { id: appId } = await ctx.params;

    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const document_type_id = String(body?.document_type_id ?? "").trim();
    const storage_path = String(body?.storage_path ?? "").trim();
    const original_name = String(body?.original_name ?? "").trim();

    const mime_type = body?.mime_type != null ? String(body.mime_type) : null;
    const size_bytes = body?.size_bytes != null ? Number(body.size_bytes) : null;

    if (!document_type_id) {
      return NextResponse.json({ ok: false, error: "document_type_id é obrigatório." }, { status: 400 });
    }
    if (!storage_path) {
      return NextResponse.json({ ok: false, error: "storage_path é obrigatório." }, { status: 400 });
    }
    if (!original_name) {
      return NextResponse.json({ ok: false, error: "original_name é obrigatório." }, { status: 400 });
    }

    // obter entity_id do utilizador
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 400 });
    }

    const entityId = profile?.entity_id;
    if (!entityId) {
      return NextResponse.json({ ok: false, error: "Utilizador sem entidade associada." }, { status: 403 });
    }

    // garantir que o pedido é desta entidade
    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, entity_id, is_deleted")
      .eq("id", appId)
      .single();

    if (appErr || !app) {
      return NextResponse.json({ ok: false, error: "Pedido não encontrado." }, { status: 404 });
    }
    if (app.is_deleted) {
      return NextResponse.json({ ok: false, error: "Pedido eliminado." }, { status: 400 });
    }
    if (app.entity_id !== entityId) {
      return NextResponse.json({ ok: false, error: "Sem permissão para este pedido." }, { status: 403 });
    }

    // inserir documento (campos coerentes com policies + schema)
    const insertRow = {
      owner_type: "APPLICATION",
      owner_id: appId,
      application_id: appId,
      entity_id: entityId,

      document_type_id,
      storage_path,

      original_name,
      file_name: original_name, // opcional, mas útil (tens ambos)
      mime_type,
      size_bytes,

      uploaded_by: user.id,
      is_deleted: false,
      status: "PENDING",
      // phase tem default CANDIDACY; não mexo aqui
      // scope é enum/nullable; deixo default/null para não rebentar por tipos
    };

    const { data: created, error: insErr } = await supabase
      .from("documents")
      .insert(insertRow)
      .select("id")
      .single();

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
