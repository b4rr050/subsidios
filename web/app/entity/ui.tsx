"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = {
  id: string;
  object_title: string;
  requested_amount: number | null;
  current_status: string;
  created_at: string | null;
};

function money(v: any) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)} €`;
}

export default function EntityHomeClient({ applications }: { applications: Row[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function deleteDraft(appId: string) {
    setMsg(null);

    const ok = window.confirm("Eliminar este pedido em rascunho?");
    if (!ok) return;

    setLoadingId(appId);

    const res = await fetch(`/api/entity/applications/${appId}/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => ({}));
    setLoadingId(null);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao eliminar rascunho.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Área da Entidade</h1>
          <p className="text-sm text-neutral-600">Pedidos e candidaturas</p>
        </div>

        <Link className="rounded-md bg-black px-3 py-2 text-sm text-white" href="/entity/new">
          + Novo pedido
        </Link>
      </header>

      {msg && <p className="text-sm">{msg}</p>}

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Pedidos (últimos 50)</h2>

        <div className="mt-4 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Título</th>
                <th className="py-2">Valor</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Criado</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((a) => {
                const isDraft = a.current_status === "S1_DRAFT";
                return (
                  <tr key={a.id} className="border-b">
                    <td className="py-2">
                      <Link className="underline" href={`/entity/applications/${a.id}`}>
                        {a.object_title}
                      </Link>
                    </td>
                    <td className="py-2">{money(a.requested_amount)}</td>
                    <td className="py-2">{a.current_status}</td>
                    <td className="py-2">{a.created_at ? new Date(a.created_at).toLocaleString() : "-"}</td>
                    <td className="py-2">
                      {isDraft ? (
                        <button
                          type="button"
                          className="rounded-md border px-3 py-1 text-red-700 disabled:opacity-60"
                          disabled={loadingId === a.id}
                          onClick={() => deleteDraft(a.id)}
                        >
                          {loadingId === a.id ? "A eliminar..." : "Eliminar"}
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-500">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {applications.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={5}>
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
