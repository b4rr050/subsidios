import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export async function POST(req: Request) {
  if (!(await isEntityUser())) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Nenhum pedido selecionado." }, { status: 400 });
  }

  const { error } = await supabase
    .from("applications")
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
      deleted_reason: "Eliminado pela entidade (draft)",
    })
    .in("id", ids);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
