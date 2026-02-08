import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityHomePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const sp = await searchParams;
  const errRaw = sp?.err;
  const err = Array.isArray(errRaw) ? errRaw[0] : errRaw;

  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("entity_id, email, full_name").eq("id", user.id).single();
  const entityId = profile?.entity_id;

  if (!entityId) redirect("/unauthorized");

  // ✅ LISTA DE PEDIDOS (não cria nada)
  const { data: apps, error: appsErr } = await supabase
    .from("applications")
    .select("id, object_title, requested_amount, current_status, created_at, updated_at, origin, category_id")
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(200);

  // buscar categorias para mostrar nome (opcional mas útil)
  const { data: cats } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");
  const catNameById: Record<string, string> = {};
  for (const c of cats ?? []) catNameById[c.id] = c.name;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meus pedidos</h1>
          <p className="text-sm text-neutral-600">
            {profile?.full_name ?? "Entidade"} {profile?.email ? `• ${profile.email}` : ""}
          </p>
        </div>

        {/* ✅ Só cria se clicar */}
        <Link href="/entity/new" className="rounded-md bg-black px-3 py-2 text-sm text-white">
          Novo pedido
        </Link>
      </header>

      {err && (
        <div className="rounded-xl border p-3 text-sm text-red-700">
          {decodeURIComponent(err)}
        </div>
      )}

      {appsErr && (
        <div className="rounded-xl border p-3 text-sm text-red-700">
          Erro a carregar pedidos: {appsErr.message}
        </div>
      )}

      <section className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="py-2 px-3">Objeto</th>
                <th className="py-2 px-3">Categoria</th>
                <th className="py-2 px-3">Valor</th>
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3">Criado</th>
                <th className="py-2 px-3">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {(apps ?? []).map((a) => (
                <tr key={a.id} className="border-b hover:bg-neutral-50">
                  <td className="py-2 px-3">
                    <Link className="underline" href={`/entity/applications/${a.id}`}>
                      {a.object_title}
                    </Link>
                    <div className="text-xs text-neutral-500">{a.origin ?? "-"}</div>
                  </td>
                  <td className="py-2 px-3">{a.category_id ? (catNameById[a.category_id] ?? a.category_id) : "-"}</td>
                  <td className="py-2 px-3">{Number(a.requested_amount ?? 0).toFixed(2)} €</td>
                  <td className="py-2 px-3">{a.current_status}</td>
                  <td className="py-2 px-3">{a.created_at ? new Date(a.created_at).toISOString().slice(0, 16).replace("T", " ") : "-"}</td>
                  <td className="py-2 px-3">{a.updated_at ? new Date(a.updated_at).toISOString().slice(0, 16).replace("T", " ") : "-"}</td>
                </tr>
              ))}

              {(apps ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 px-3 text-neutral-600">
                    Ainda não tens pedidos. Clica em <strong>Novo pedido</strong> para iniciar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
