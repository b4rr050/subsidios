"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type App = {
  id: string;
  object_title: string;
  requested_amount: number | null;
  current_status: string;
  origin: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Entity = { id: string; name: string; nif: string };
type Category = { id: string; name: string };

type DocRow = {
  id: string;
  document_type_id: string;
  storage_path?: string | null;
  file_path?: string | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  uploaded_at: string;
  review_comment: string | null;
};

type DecisionRow = {
  application_id: string;
  decision: "APPROVE_TO_PROCEED" | "RETURN_FOR_CORRECTION";
  comment: string | null;
  decided_at: string;
} | null;

function money(v: any) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)} €`;
}

export default function PresidentApplicationClient({
  application,
  entity,
  category,
  documents,
  decision,
}: {
  application: App;
  entity: Entity | null;
  category: Category | null;
  documents: DocRow[];
  decision: DecisionRow;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canDecide = application.current_status === "S6_READY_FOR_PRESIDENT";

  async function openDoc(d: DocRow) {
    setMsg(null);
    const path = d.storage_path ?? d.file_path ?? null;

    if (!path) {
      setMsg("Documento sem caminho no storage.");
      return;
    }

    const { data, error } = await supabase.storage.from("docs").createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      setMsg(error?.message ?? "Erro a abrir documento.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function decide(nextDecision: "APPROVE_TO_PROCEED" | "RETURN_FOR_CORRECTION") {
    setMsg(null);

    let comment: string | undefined = undefined;

    if (nextDecision === "RETURN_FOR_CORRECTION") {
      const c = window.prompt("Motivo (obrigatório):") ?? "";
      if (!c.trim()) {
        setMsg("Operação cancelada: comentário obrigatório.");
        return;
      }
      comment = c.trim();
    } else {
      const c = window.prompt("Comentário (opcional):") ?? "";
      if (c.trim()) comment = c.trim();
    }

    setLoading(true);

    const res = await fetch(`/api/president/applications/${application.id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: nextDecision, comment }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao decidir.");
      return;
    }

    setMsg(nextDecision === "APPROVE_TO_PROCEED" ? "Aprovado para seguir." : "Devolvido para correção.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-medium">Resumo</h2>
            <p className="text-sm">{application.object_title}</p>
            <p className="text-xs text-neutral-600">
              {entity?.name ?? "Entidade"} {entity?.nif ? `• NIF ${entity.nif}` : ""} {category?.name ? `• ${category.name}` : ""}
            </p>
            <p className="text-xs text-neutral-600">
              Valor: {money(application.requested_amount)} • Origem: {application.origin ?? "-"}
            </p>
            <p className="text-xs text-neutral-600">
              Criado: {application.created_at ? new Date(application.created_at).toLocaleString("pt-PT") : "-"} • Atualizado:{" "}
              {application.updated_at ? new Date(application.updated_at).toLocaleString("pt-PT") : "-"}
            </p>
          </div>

          <span className="text-sm rounded-md border px-2 py-1">{application.current_status}</span>
        </div>

        {decision && (
          <p className="mt-3 text-sm text-neutral-700">
            Última decisão: <b>{decision.decision}</b> — {decision.decided_at ? new Date(decision.decided_at).toLocaleString("pt-PT") : ""}{" "}
            {decision.comment ? `• ${decision.comment}` : ""}
          </p>
        )}

        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Documentos</h2>

        <div className="mt-4 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Nome</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Comentário</th>
                <th className="py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className="py-2">
                    <button className="underline" type="button" onClick={() => openDoc(d)}>
                      {d.original_name}
                    </button>
                  </td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">{d.review_comment ?? "-"}</td>
                  <td className="py-2">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString("pt-PT") : "-"}</td>
                </tr>
              ))}

              {documents.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={4}>
                    Sem documentos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Decisão do Presidente</h2>

        {!canDecide && (
          <p className="mt-2 text-sm text-neutral-600">
            Para decidir, o pedido tem de estar em <b>S6_READY_FOR_PRESIDENT</b>.
          </p>
        )}

        {canDecide && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => decide("APPROVE_TO_PROCEED")}
            >
              {loading ? "..." : "Aprovar para seguir"}
            </button>

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm text-red-700 disabled:opacity-60"
              disabled={loading}
              onClick={() => decide("RETURN_FOR_CORRECTION")}
            >
              {loading ? "..." : "Devolver para correção"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
