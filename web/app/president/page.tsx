import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Row = {
  id: string;
  object_title: string;
  requested_amount: number | null;
  current_status: string;
  created_at: string | null;
  origin: string | null;
  entity?: { name: string; nif: string } | null;
  category?: { name: string } | null;
};

async function isPresident() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "PRESIDENT" });
  return data === true;
}

function money(v: any) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)} €`;
}

function fmtDate(dt?: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}

export default async function PresidentPage() {
  if (!(await isPresident())) redirect("/unauthorized");

  const supabase = await createClient();

  // 1) contadores (para não parecer “em branco”)
  const { data: countsRaw, error: countsErr } = await supabase
    .from("applications")
    .select("current_status")
    .eq("is_deleted", false);

  const counts: Record<string, number> = {};
  for (const r of countsRaw ?? []) {
    const s = String((r as any).current_status ?? "");
    counts[s] = (counts[s] ?? 0) + 1;
  }

  // 2) lista para o presidente: pendentes + já decididos
  const { data: apps, error } = await supabase
    .from("applications")
    .select(
      `
      id,
      object_title,
      requested_amount,
      current_status,
      created_at,
      origin,
      entity:entities!applications_entity_id_fkey(name,nif),
      category:categories!applications_category_id_fkey(name)
    `
    )
    .eq("is_deleted", false)
    .in("current_status", ["S6_READY_FOR_PRESIDENT", "S7_PRESIDENT_DECIDED"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Presidente · Pedidos</h1>
        <p className="mt-2 text-sm text-red-600">Erro: {error.message}</p>
        {countsErr ? <p className="mt-2 text-xs text-neutral-600">Counts erro: {countsErr.message}</p> : null}
      </div>
    );
  }

  const rows = (apps ?? []) as unknown as Row[];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Presidente · Pedidos</h1>
          <p className="text-sm text-neutral-600">Pendentes para decisão e decisões já registadas</p>
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

      {/* Contadores para perceber logo se existem pendentes */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Resumo</h2>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-xl border p-3">
            <div className="text-xs text-neutral-500">Prontos p/ Presidente</div>
            <div className="text-lg font-semibold">{counts["S6_READY_FOR_PRESIDENT"] ?? 0}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-neutral-500">Decididos</div>
            <div className="text-lg font-semibold">{counts["S7_PRESIDENT_DECIDED"] ?? 0}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-neutral-500">Em rascunho</div>
            <div className="text-lg font-semibold">{counts["S1_DRAFT"] ?? 0}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs text-neutral-500">Submetidos</div>
            <div className="text-lg font-semibold">{counts["S2_SUBMITTED"] ?? 0}</div>
          </div>
        </div>
      </section>

      {/* Lista */}
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
                    <Link className="underline" href={`/president/applications/${a.id}`}>
                      {a.object_title}
                    </Link>
                    <div className="text-xs text-neutral-500">Origem: {a.origin ?? "-"}</div>
                  </td>

                  <td className="py-2">{money(a.requested_amount)}</td>
                  <td className="py-2">{a.current_status}</td>
                  <td className="py-2">{fmtDate(a.created_at)}</td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={7}>
                    Não existem pedidos para o Presidente neste momento (S6_READY_FOR_PRESIDENT / S7_PRESIDENT_DECIDED).
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
