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

    const { id } = await ctx.params;

    const supabase = await createClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
    }

    // Atualização lógica (RLS decide se é permitido)
    const { error } = await supabase
      .from("documents")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deleted_reason: "Removido pela entidade (draft/returned)",
      })
      .eq("id", id)
      .eq("is_deleted", false);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
