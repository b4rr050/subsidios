import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
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
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: "Nenhum pedido selecionado." }, { status: 400 });
    }

    // Soft delete em massa (RLS vai travar se não forem DRAFT/da entidade)
    const { error } = await supabase
      .from("applications")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
        deleted_reason: "Eliminado pela entidade (draft) - bulk",
      })
      .in("id", ids)
      .eq("is_deleted", false);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado." }, { status: 500 });
  }
}
