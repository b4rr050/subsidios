"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };

type App = {
  id: string;
  category_id: string;
  object_title: string;
  requested_amount: number;
  current_status: string;
  origin: string;
};

type Hist = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  comment: string | null;
};

function canEdit(status: string) {
  return ["S1_DRAFT", "S2_SUBMITTED", "S3_IN_REVIEW", "S4_RETURNED"].includes(status);
}
function canSubmit(status: string) {
  return status === "S1_DRAFT" || status === "S4_RETURNED";
}

export default function ApplicationClient({
  application,
  categories,
  history,
}: {
  application: App;
  categories: Category[];
  history: Hist[];
}) {
  const router = useRouter();

  const [categoryId, setCategoryId] = useState(application.category_id);
  const [title, setTitle] = useState(application.object_title);
  const [amount, setAmount] = useState(String(application.requested_amount ?? 0));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const editable = useMemo(() => canEdit(application.current_status), [application.current_status]);
  const submittable = useMemo(() => canSubmit(application.current_status), [application.current_status]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    const res = await fetch(`/api/entity/applications/${application.id}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category_id: categoryId,
        object_title: title,
        requested_amount: amount,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao guardar");
      return;
    }

    setMsg("Guardado.");
    router.refresh();
  }

  async function submit() {
    setMsg(null);
    setLoading(true);

    const res = await fetch(`/api/entity/applications/${application.id}/submit`, {
      method: "POST",
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao submeter");
      return;
    }

    setMsg("Submetido.");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Dados do pedido</h2>
          <span className="text-sm rounded-md border px-2 py-1">{application.current_status}</span>
        </div>

        <form onSubmit={save} className="mt-4 grid gap-3 max-w-2xl">
          <div className="grid gap-2">
            <label className="text-sm">Categoria</label>
            <select
              className="rounded-md border px-3 py-2"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={!editable || loading}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm">Título / Objeto</label>
            <input
              className="rounded-md border px-3 py-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!editable || loading}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm">Valor solicitado (€)</label>
            <input
              className="rounded-md border px-3 py-2"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              disabled={!editable || loading}
            />
          </div>

          {msg && <p className="text-sm">{msg}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              disabled={!editable || loading}
            >
              {loading ? "A guardar..." : "Guardar"}
            </button>

            <button
              type="button"
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={!submittable || loading}
              onClick={submit}
            >
              {loading ? "A submeter..." : "Submeter"}
            </button>
          </div>

          {!editable && (
            <p className="text-xs text-neutral-600">
              Este pedido já não permite edição. Se necessário, pede reabertura ao técnico.
            </p>
          )}
        </form>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Histórico de estados</h2>
        <div className="overflow-auto">
          <table className="min-w-[700px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">De</th>
                <th className="py-2">Para</th>
                <th className="py-2">Data</th>
                <th className="py-2">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b">
                  <td className="py-2">{h.from_status ?? "-"}</td>
                  <td className="py-2">{h.to_status}</td>
                  <td className="py-2">{h.changed_at ? new Date(h.changed_at).toLocaleString() : "-"}</td>
                  <td className="py-2">{h.comment ?? "-"}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={4}>
                    Sem histórico ainda.
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
