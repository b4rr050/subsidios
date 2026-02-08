"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BackofficeAppClient({
  app,
  statusHistory,
  changeLog,
}: {
  app: any;
  statusHistory: any[];
  changeLog: any[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  async function call(action: "assume" | "validate" | "return" | "reopen") {
    setMsg(null);
    setLoading(true);

    const res = await fetch(`/api/backoffice/applications/${app.id}/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro");
      return;
    }

    setMsg("OK.");
    setComment("");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Dados</h2>
          <span className="text-sm rounded-md border px-2 py-1">{app.current_status}</span>
        </div>

        <div className="mt-3 grid gap-2 text-sm">
          <div><b>Entidade:</b> {app.entities?.name ?? "-"} (NIF {app.entities?.nif ?? "-"})</div>
          <div><b>Categoria:</b> {app.categories?.name ?? "-"}</div>
          <div><b>Título:</b> {app.object_title}</div>
          <div><b>Valor:</b> {Number(app.requested_amount ?? 0).toFixed(2)} €</div>
          <div><b>Origem:</b> {app.origin}</div>
          <div><b>Criado:</b> {app.created_at ? new Date(app.created_at).toLocaleString() : "-"}</div>
          <div><b>Submetido:</b> {app.submitted_at ? new Date(app.submitted_at).toLocaleString() : "-"}</div>
        </div>

        <div className="mt-4 grid gap-2">
          <label className="text-sm">Comentário (opcional)</label>
          <textarea
            className="rounded-md border px-3 py-2 text-sm"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Ex.: Falta documento X / Validado tecnicamente / Reabertura autorizada..."
            disabled={loading}
          />
        </div>

        {msg && <p className="mt-3 text-sm">{msg}</p>}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            disabled={loading}
            onClick={() => call("assume")}
          >
            Assumir (S2→S3)
          </button>

          <button
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={loading}
            onClick={() => call("validate")}
          >
            Validar (→S5)
          </button>

          <button
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            disabled={loading}
            onClick={() => call("return")}
          >
            Devolver à entidade (→S4)
          </button>

          <button
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            disabled={loading}
            onClick={() => call("reopen")}
          >
            Reabrir (S5→S4)
          </button>
        </div>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Histórico de estados</h2>
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">De</th>
                <th className="py-2">Para</th>
                <th className="py-2">Data</th>
                <th className="py-2">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {statusHistory.map((h) => (
                <tr key={h.id} className="border-b">
                  <td className="py-2">{h.from_status ?? "-"}</td>
                  <td className="py-2">{h.to_status}</td>
                  <td className="py-2">{h.changed_at ? new Date(h.changed_at).toLocaleString() : "-"}</td>
                  <td className="py-2">{h.comment ?? "-"}</td>
                </tr>
              ))}
              {statusHistory.length === 0 && (
                <tr><td className="py-3 text-neutral-600" colSpan={4}>Sem histórico.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Histórico de alterações (audit)</h2>
        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Campo</th>
                <th className="py-2">Antes</th>
                <th className="py-2">Depois</th>
                <th className="py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {changeLog.map((c) => (
                <tr key={c.id} className="border-b">
                  <td className="py-2">{c.field}</td>
                  <td className="py-2">{c.old_value ?? "-"}</td>
                  <td className="py-2">{c.new_value ?? "-"}</td>
                  <td className="py-2">{c.changed_at ? new Date(c.changed_at).toLocaleString() : "-"}</td>
                </tr>
              ))}
              {changeLog.length === 0 && (
                <tr><td className="py-3 text-neutral-600" colSpan={4}>Sem alterações registadas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
