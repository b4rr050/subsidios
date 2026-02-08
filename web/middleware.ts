import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/middleware";

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // ✅ 1) Nunca aplicar middleware às rotas de API
  // (senão o POST /api/auth/login é redirecionado e dá 405)
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // ✅ 2) Permitir assets e rotas internas do Next
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createClient(req, res);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ✅ 3) Rotas públicas
  const publicPaths = ["/login", "/unauthorized"];
  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  // Não autenticado -> rota privada => login
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Autenticado -> ir ao login => home
  if (user && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  // ✅ 4) Proteções por área

  // ADMIN
  if (user && pathname.startsWith("/admin")) {
    const { data: isAdmin } = await supabase.rpc("has_role", { role: "ADMIN" });
    if (isAdmin !== true) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  // BACKOFFICE (ADMIN ou TECH)
  if (user && pathname.startsWith("/backoffice")) {
    const { data: isAdmin } = await supabase.rpc("has_role", { role: "ADMIN" });
    const { data: isTech } = await supabase.rpc("has_role", { role: "TECH" });

    if (isAdmin !== true && isTech !== true) {
      const url = req.nextUrl.clone();
      url.pathname = "/unauthorized";
      return NextResponse.redirect(url);
    }
  }

  // ENTITY
  if (user && pathname.startsWith("/entity")) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
