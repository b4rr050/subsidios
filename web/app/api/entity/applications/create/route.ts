import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

function normalizeObjectTitle(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, " ") // só letras/números
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  try {
    if (!(await isEntityUser())) {
      return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const category_id = body?.category_id ? String(body.category_id) : null;
    const object_title = String(body?.object_title ?? "").trim();

    // 🔒 Campos obrigatórios no teu schema:
    // - entity_id (vem do profile)
    // - category_id NOT NULL  (se queres permitir "sem categoria", tens de mudar schema)
    // - object_title NOT NULL
    // - object_normalized NOT NULL
    // - requested_amount NOT NULL

    if (!category_id) {
      return NextResponse.json({ ok: false, error: "Categoria é obrigatória." }, { status: 400 });
    }
    if (!object_title) {
      return NextResponse.json({ ok: false, error: "Título/Objeto é obrigatório." }, { status: 400 });
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("entity_id")
      .eq("id", user.id)
      .single();

    if (profErr) {
      return NextResponse.json({ ok: false, error: profErr.message }, { status: 400 });
    }

    const entity_id = profile?.entity_id;
    if (!entity_id) {
      return NextResponse.json({ ok: false, error: "Utilizador sem entidade associada." }, { status: 403 });
    }

    const row = {
      origin: "SPONTANEOUS", // ajusta se o teu enum for outro; se der erro, diz-me o enum exato
      program_id: null,
      entity_id,
      category_id,
      object_title,
      object_normalized: normalizeObjectTitle(object_title),

      // ✅ blindagem: nunca null
      requested_amount: 0,

      // gestão
      created_by: user.id,
      is_deleted: false,
    };

    const { data: created, error: insErr } = await supabase
      .from("applications")
      .insert(row)
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
