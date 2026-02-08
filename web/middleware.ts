import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createClient(req, res);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = req.nextUrl.pathname;

  // Rotas públicas (não protegidas)
  const publicPaths = ["/login", "/unauthorized", "/"];
  if (publicPaths.includes(pathname)) {
    return res;
  }

  // Se não estiver autenticado, redireciona para login
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  /* =========================
     ADMIN
  ========================= */
  if (pathname.startsWith("/admin")) {
    const { data: isAdmin } = await supabase.rpc("has_role", { role: "ADMIN" });
    if (isAdmin !== true) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  /* =========================
     BACKOFFICE (ADMIN ou TECH)
  ========================= */
  if (pathname.startsWith("/backoffice")) {
    const { data: isAdmin } = await supabase.rpc("has_role", { role: "ADMIN" });
    const { data: isTech } = await supabase.rpc("has_role", { role: "TECH" });

    if (isAdmin !== true && isTech !== true) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  /* =========================
     ENTITY
  ========================= */
  if (pathname.startsWith("/entity")) {
    const { data: isEntity } = await supabase.rpc("has_role", { role: "ENTITY" });
    if (isEntity !== true) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    /*
      Protege tudo exceto:
      - ficheiros estáticos
      - api routes públicas (as privadas continuam protegidas por RLS)
    */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
