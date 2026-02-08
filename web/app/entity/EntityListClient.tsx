"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AppRow = {
  id: string;
  object_title: string;
  requested_amount: number;
  current_status: string;
  created_at: string | null;
  updated_at: string | null;
  origin: string | null;
  category_id: string | null;
};

function money(v: any) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)} €`;
}

function fmtDate(dt?: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}

export default function EntityListClient({
  profile,
  entityId,
  apps,
  catNameById,
  errorMsg,
}: {
  profile: { full_name: string | null; email: string | null };
  entityId: string;
  apps: AppRow[];
  catNameById: Record<string, string>;
  errorMsg: string | null;
}) {
  const router = useRouter();

  const draftIds = useMemo(
    () => (apps ?? []).filter((a) => a.current_status === "S1_DRAFT").map((a) => a.id),
    [apps]
  );

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const selectedDraftIds = useMemo(() => {
    const ids = Object.entries(selected)
      .filter(([id, v]) => v && draftIds.includes(id))
      .map(([id]) => id);
    return ids;
  }, [selected, draftIds]);

  function toggle(id: string, value: boolean) {
    setSelected((prev) => ({ ...prev, [id]: value }));
  }

  function toggleAllDrafts(value: boolean) {
    const next: Record<string, boolean> = { ...selected };
    for (const id of draftIds) next[id] = value;
    setSelected(next);
  }

  async function deleteMany(ids: string[]) {
    if (!ids.length) return;

    const ok1 = window.confirm(`Eliminar ${ids.length} pedido(s) em rascunho?`);
    if (!ok1) return;

    const ok2 = window.confirm("Confirma: queres mesmo ELIMINAR estes rascunhos? (não apaga da BD, só oculta)");
    if (!ok2) return;

    setBusy(true);
    const res = await fetch("/api/entity/applications/delete-many", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    const data = await res.json().catch(() => ({}));
    setBusy(false);

    if (!res.ok || data?.ok !== true) {
      alert(data?.error ?? "Erro ao eliminar pedidos.");
      return;
    }

    setSelected({});
    router.refresh();
  }

  async function deleteSingle(id: string) {
    await deleteMany([id]);
  }

  const allDraftsSelected = draftIds.length > 0 && draftIds.every((id) => selected[id] === true);

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Meus pedidos</h1>
          <p className="text-sm text-neutral-600">
            {profile.full_name ?? "Entidade"}
            {profile.email ? ` • ${profile.email}` : ""}
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/entity/new" className="rounded-md bg-black px-3 py-2 text-sm text-white">
            Novo pedido
          </Link>
        </div>
      </header>

      {errorMsg && (
        <div className="rounded-xl border p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <section className="rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-2 border-b">
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allDraftsSelected}
              onChange={(e) => toggleAllDrafts(e.target.checked)}
              disabled={draftIds.length === 0 || busy}
              title="Selecionar todos os rascunhos"
            />
            <span>
              Selecionar rascunhos ({selectedDraftIds.length}/{draftIds.length})
            </span>
          </div>

          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm text-red-700 disabled:opacity-60"
            disabled={busy || selectedDraftIds.length === 0}
            onClick={() => deleteMany(selectedDraftIds)}
            title="Só elimina pedidos em S1_DRAFT"
          >
            {busy ? "A eliminar..." : "Eliminar selecionados"}
          </button>
        </div>

        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="py-2 px-3 w-[42px]">Sel.</th>
                <th className="py-2 px-3">Objeto</th>
                <th className="py-2 px-3">Categoria</th>
                <th className="py-2 px-3">Valor</th>
                <th className="py-2 px-3">Estado</th>
                <th className="py-2 px-3">Criado</th>
                <th className="py-2 px-3">Atualizado</th>
                <th className="py-2 px-3 w-[120px]">Ações</th>
              </tr>
            </thead>

            <tbody>
              {(apps ?? []).map((a) => {
                const isDraft = a.current_status === "S1_DRAFT";
                return (
                  <tr key={a.id} className="border-b hover:bg-neutral-50">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={selected[a.id] === true}
                        onChange={(e) => toggle(a.id, e.target.checked)}
                        disabled={!isDraft || busy}
                        title={isDraft ? "Selecionar" : "Só rascunhos podem ser selecionados"}
                      />
                    </td>

                    <td className="py-2 px-3">
                      <Link className="underline" href={`/entity/applications/${a.id}`}>
                        {a.object_title}
                      </Link>
                      <div className="text-xs text-neutral-500">{a.origin ?? "-"}</div>
                    </td>

                    <td className="py-2 px-3">
                      {a.category_id ? (catNameById[a.category_id] ?? a.category_id) : "-"}
                    </td>

                    <td className="py-2 px-3">{money(a.requested_amount)}</td>
                    <td className="py-2 px-3">{a.current_status}</td>
                    <td className="py-2 px-3">{fmtDate(a.created_at)}</td>
                    <td className="py-2 px-3">{fmtDate(a.updated_at)}</td>

                    <td className="py-2 px-3">
                      <button
                        type="button"
                        className="rounded-md border px-2 py-1 text-xs text-red-700 disabled:opacity-60"
                        disabled={!isDraft || busy}
                        onClick={() => deleteSingle(a.id)}
                        title="Eliminar (apenas em S1_DRAFT)"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}

              {(apps ?? []).length === 0 && (
                <tr>
                  <td colSpan={8} className="py-6 px-3 text-neutral-600">
                    Ainda não tens pedidos. Clica em <strong>Novo pedido</strong> para iniciar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-neutral-500">
        Nota: “Eliminar” apenas oculta o pedido (soft delete). Pedidos já submetidos não podem ser eliminados pela entidade.
      </p>
    </div>
  );
}
