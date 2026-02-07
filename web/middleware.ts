import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(req: NextRequest) {
  // Rotas públicas
  const publicPaths = ["/login"];
  const pathname = req.nextUrl.pathname;

  // Permitir assets e rotas internas do Next
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/public")
  ) {
    return NextResponse.next();
  }

  // Se for público, deixa passar (mas mantém sessão atualizada)
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Se não está autenticado e tenta rota privada -> login
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Se está autenticado e tenta ir ao login -> manda para home
  if (user && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  // Proteção extra para /admin: só ADMIN
  if (user && pathname.startsWith("/admin")) {
    const { data, error } = await supabase.rpc("has_role", { role: "ADMIN" });
    if (error || data !== true) {
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
      Aplica a todas as rotas exceto:
      - static files
      - imagens
    */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
