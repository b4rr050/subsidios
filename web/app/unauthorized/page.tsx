import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function UnauthorizedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // se nem está logado, manda para login
  if (!user) redirect("/login");

  // descobrir destino "portal certo"
  const isAdmin = (await supabase.rpc("has_role", { role: "ADMIN" })).data === true;
  const isPresident = (await supabase.rpc("has_role", { role: "PRESIDENT" })).data === true;
  const isTech = (await supabase.rpc("has_role", { role: "TECH" })).data === true;
  const isEntity = (await supabase.rpc("has_role", { role: "ENTITY" })).data === true;

  let portalHref = "/";

  if (isAdmin) portalHref = "/admin/users";
  else if (isPresident) portalHref = "/president";
  else if (isTech) portalHref = "/backoffice/applications";
  else if (isEntity) portalHref = "/entity";

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-2 text-sm text-neutral-700">
          A tua conta não tem permissões para aceder a esta área.
        </p>

        <div className="mt-6 flex gap-3">
          <Link className="rounded-md border px-4 py-2 text-sm" href={portalHref}>
            Voltar ao portal
          </Link>

          <Link className="rounded-md bg-black px-4 py-2 text-sm text-white" href="/login">
            Ir para Login
          </Link>
        </div>
      </div>
    </div>
  );
}
