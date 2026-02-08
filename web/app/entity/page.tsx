import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function isEntityUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_role", { role: "ENTITY" });
  if (error) return false;
  return data === true;
}

export default async function EntityHomePage() {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, entity_id")
    .single();

  const entityId = profile?.entity_id;

  if (!entityId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Entidade</h1>
        <p className="mt-2 text-sm text-red-600">
          A tua conta não tem entidade associada. Contacta o administrador.
        </p>
      </div>
    );
  }

  const { data: entity } = await supabase
    .from("entities")
    .select("id, name, nif, email, phone")
    .eq("id", entityId)
    .single();

  const { data: applications, error: appsErr } = await supabase
    .from("applications")
    .select("id, object_title, requested_amount, current_status, created_at")
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Área da Entidade</h1>
          <p className="text-sm text-neutral-600">
            {entity?.name} · NIF {entity?.nif}
          </p>
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

      <section className="rounded-2xl border p-4 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="font-medium">Pedidos</h2>
          <p className="text-sm text-neutral-600">
            Cria um novo pedido avulso (candidatura espontânea).
          </p>
        </div>

        <Link className="rounded-md bg-black px-3 py-2 text-sm text-white" href="/entity/applications/new">
          Novo pedido
        </Link>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Últimos pedidos</h2>

        {appsErr && <p className="text-sm text-red-600">Erro: {appsErr.message}</p>}

        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Título</th>
                <th className="py-2">Valor pedido</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Criado</th>
              </tr>
            </thead>
            <tbody>
              {(applications ?? []).map((a) => (
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
              {(applications ?? []).length === 0 && (
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
