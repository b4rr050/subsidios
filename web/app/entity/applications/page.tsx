import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityApplicationsPage() {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", user.id)
    .single();

  const entityId = profile?.entity_id;
  if (!entityId) redirect("/unauthorized");

  const { data: apps } = await supabase
    .from("applications")
    .select("id, object_title, requested_amount, current_status, created_at")
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Pedidos</h1>
          <p className="text-sm text-neutral-600">Todos os pedidos da entidade</p>
          <p className="text-xs text-neutral-500">{user.email}</p>
        </div>

        <div className="flex items-center gap-3">
          <LogoutButton />

          <Link className="rounded-md border px-3 py-2 text-sm" href="/entity">
            Voltar
          </Link>

          <form
            action={async () => {
              "use server";
              const supabase = await createClient();

              const {
                data: { user },
              } = await supabase.auth.getUser();
              if (!user) redirect("/login");

              const { data: profile } = await supabase
                .from("profiles")
                .select("entity_id")
                .eq("id", user.id)
                .single();

              const entityId = profile?.entity_id;
              if (!entityId) redirect("/unauthorized");

              // Buscar uma categoria ativa (para evitar NULL / constraint)
              const { data: cat, error: catErr } = await supabase
                .from("categories")
                .select("id")
                .eq("is_active", true)
                .order("name")
                .limit(1)
                .single();

              if (catErr || !cat?.id) {
                redirect("/entity/applications?err=no_categories");
              }

              const ins = await supabase
                .from("applications")
                .insert({
                  entity_id: entityId,
                  category_id: cat.id,
                  object_title: "Novo pedido",
                  requested_amount: 0,
                  current_status: "S1_DRAFT",
                  origin: "SPONTANEOUS",
                })
                .select("id")
                .single();

              if (ins.error || !ins.data?.id) {
                const msg = encodeURIComponent(ins.error?.message ?? "create_failed");
                redirect(`/entity/applications?err=${msg}`);
              }

              redirect(`/entity/applications/${ins.data.id}`);
            }}
          >
            <button className="rounded-md bg-black px-3 py-2 text-sm text-white">
              + Novo pedido
            </button>
          </form>
        </div>
      </header>

      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Título</th>
                <th className="py-2">Valor</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Criado</th>
              </tr>
            </thead>
            <tbody>
              {(apps ?? []).map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="py-2">
                    <Link className="underline" href={`/entity/applications/${a.id}`}>
                      {a.object_title}
                    </Link>
                  </td>
                  <td className="py-2">{Number(a.requested_amount ?? 0).toFixed(2)} €</td>
                  <td className="py-2">{a.current_status}</td>
                  <td className="py-2">{a.created_at ? new Date(a.created_at).toLocaleString() : "-"}</td>
                </tr>
              ))}

              {(apps?.length ?? 0) === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={4}>
                    Ainda não existem pedidos.
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
