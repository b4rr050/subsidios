import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function roleRedirect(supabase: any) {
  // Atenção: usa RPC has_role(role text) que já tinhas no projeto
  const [{ data: isAdmin }, { data: isTech }, { data: isEntity }] = await Promise.all([
    supabase.rpc("has_role", { role: "ADMIN" }),
    supabase.rpc("has_role", { role: "TECH" }),
    supabase.rpc("has_role", { role: "ENTITY" }),
  ]);

  if (isAdmin === true) return "/admin/users";
  if (isTech === true) return "/backoffice/applications";
  if (isEntity === true) return "/entity";
  return "/unauthorized";
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ ok: false, error: "Email e palavra-passe são obrigatórios." }, { status: 400 });
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }

    // garantir que há user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Sessão inválida após login." }, { status: 401 });
    }

    const redirectTo = await roleRedirect(supabase);

    return NextResponse.json({ ok: true, redirectTo });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Erro inesperado no login." }, { status: 500 });
  }
}
