import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ApplicationRow = {
  id: string;
  object_title: string;
  requested_amount: number | null;
  current_status: string;
  created_at: string | null;

  entity?: { name: string; nif: string } | null;
  category?: { name: string } | null;
};

async function isTechOrAdmin() {
  const supabase = await createClient();
  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  return a.data === true || t.data === true;
}

export default async function BackofficeApplicationsPage() {
  if (!(await isTechOrAdmin())) redirect("/unauthorized");

  const supabase = await createClient();

  const { data: apps, error } = await supabase
    .from("applications")
    .select(
      `
      id,
      object_title,
      requested_amount,
      current_status,
      created_at,
      entity:entities!applications_entity_id_fkey(name,nif),
      category:categories!applications_category_id_fkey(name)
    `
    )
    .eq("is_deleted", false)
    .neq("current_status", "S1_DRAFT") // ✅ esconder rascunhos
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Backoffice · Pedidos</h1>
        <p className="mt-2 text-sm text-red-600">Erro: {error.message}</p>
      </div>
    );
  }

  const rows = (apps ?? []) as unknown as ApplicationRow[];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Backoffice · Pedidos</h1>
          <p className="text-sm text-neutral-600">Lista (últimos 200) — sem rascunhos</p>
        </div>

        <form
          action={async () => {
            "use server";
            const supabase = await createClient();
            await supabase.auth.signOut();
            redirect("/login");
          }}
        >
          <button className="rounded-md border px-3 py-2 text-sm">Sair</button>
        </form>
      </header>

      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Entidade</th>
                <th className="py-2">NIF</th>
                <th className="py-2">Categoria</th>
                <th className="py-2">Título</th>
                <th className="py-2">Valor</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Criado</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="py-2">{a.entity?.name ?? "-"}</td>
                  <td className="py-2">{a.entity?.nif ?? "-"}</td>
                  <td className="py-2">{a.category?.name ?? "-"}</td>

                  <td className="py-2">
                    <Link className="underline" href={`/backoffice/applications/${a.id}`}>
                      {a.object_title}
                    </Link>
                  </td>

                  <td className="py-2">{Number(a.requested_amount ?? 0).toFixed(2)} €</td>
                  <td className="py-2">{a.current_status}</td>
                  <td className="py-2">{a.created_at ? new Date(a.created_at).toLocaleString("pt-PT") : "-"}</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={7}>
                    Sem pedidos.
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
