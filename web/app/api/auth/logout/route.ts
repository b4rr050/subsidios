import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirectToLogin(req: Request) {
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirectToLogin(req);
}

// Se alguém abrir /api/auth/logout no browser (GET), também redireciona para login
export async function GET(req: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return redirectToLogin(req);
}
