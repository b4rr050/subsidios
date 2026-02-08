"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Category = { id: string; name: string };

export default function NewApplicationClient({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("0");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dups, setDups] = useState<any[]>([]);

  const canSubmit = useMemo(() => categoryId && title.trim().length >= 3, [categoryId, title]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setDups([]);
    setLoading(true);

    const res = await fetch("/api/entity/applications/create", {
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
      setMsg(data?.error ?? "Erro");
      return;
    }

    if (Array.isArray(data?.possibleDuplicates) && data.possibleDuplicates.length > 0) {
      setDups(data.possibleDuplicates);
    }

    setMsg("Pedido criado (rascunho).");
    router.replace("/entity");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="max-w-2xl grid gap-4 rounded-2xl border p-4 shadow-sm">
      <div className="grid gap-2">
        <label className="text-sm">Categoria</label>
        <select className="rounded-md border px-3 py-2" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-2">
        <label className="text-sm">Título / Objeto</label>
        <input className="rounded-md border px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>

      <div className="grid gap-2">
        <label className="text-sm">Valor solicitado (€)</label>
        <input className="rounded-md border px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </div>

      {msg && <p className="text-sm">{msg}</p>}

      {dups.length > 0 && (
        <div className="rounded-xl border p-3">
          <p className="text-sm font-medium">Atenção: possíveis pedidos semelhantes</p>
          <ul className="mt-2 text-sm list-disc pl-5">
            {dups.map((d) => (
              <li key={d.id}>
                {d.object_title} ({d.current_status}) — {d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="rounded-md bg-black text-white px-3 py-2 disabled:opacity-60" disabled={!canSubmit || loading}>
        {loading ? "A criar..." : "Criar pedido"}
      </button>
    </form>
  );
}
