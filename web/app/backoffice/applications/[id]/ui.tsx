"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type DocType = { id: string; name: string; scope?: string | null; is_active?: boolean | null };

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

type ReviewRow = {
  id: string;
  document_id: string;
  decision: "APPROVED" | "REJECTED";
  comment: string | null;
  decided_by: string;
  decided_at: string;
};

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

type Hist = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  comment: string | null;
};

function money(v: any) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)} €`;
}

function fmtDate(dt?: string | null) {
  if (!dt) return "-";
  return new Date(dt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" });
}

export default function BackofficeApplicationClient({
  application,
  entity,
  category,
  history,
  documents,
  documentTypes,
  reviewHistory,
  reviewerById,
}: {
  application: App;
  entity: Entity | null;
  category: Category | null;
  history: Hist[];
  documents: DocRow[];
  documentTypes: DocType[];
  reviewHistory: ReviewRow[];
  reviewerById: Record<string, { email?: string | null; full_name?: string | null }>;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [msg, setMsg] = useState<string | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [loadingDocId, setLoadingDocId] = useState<string | null>(null);

  const status = application.current_status;

  const docTypeNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of documentTypes ?? []) m[t.id] = t.name;
    return m;
  }, [documentTypes]);

  const docNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const d of documents ?? []) m[d.id] = d.original_name;
    return m;
  }, [documents]);

  // 🔁 Ações Tech
  const canReturnToEntity = status === "S3_IN_REVIEW";
  const canValidateTech = status === "S3_IN_REVIEW";
  const canSendToPresident = status === "S5_TECH_VALIDATED"; // ✅ aqui está o “loop” que faltava

  async function openDoc(d: DocRow) {
    setDocMsg(null);
    const path = d.storage_path ?? d.file_path ?? null;

    if (!path) {
      setDocMsg("Documento sem caminho no storage.");
      return;
    }

    const { data, error } = await supabase.storage.from("docs").createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      setDocMsg(error?.message ?? "Erro a gerar link para abrir documento.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function techReturnToEntity() {
    setMsg(null);
    const comment = (window.prompt("Motivo para devolver à entidade (obrigatório):") ?? "").trim();
    if (!comment) {
      setMsg("Operação cancelada: comentário obrigatório.");
      return;
    }

    setLoadingAction("RETURN");
    const res = await fetch(`/api/backoffice/applications/${application.id}/return`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment }),
    });
    const data = await res.json().catch(() => ({}));
    setLoadingAction(null);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao devolver.");
      return;
    }

    setMsg("Pedido devolvido à entidade.");
    router.refresh();
  }

  async function techValidate() {
    setMsg(null);

    setLoadingAction("VALIDATE");
    const res = await fetch(`/api/backoffice/applications/${application.id}/validate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setLoadingAction(null);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao validar tecnicamente.");
      return;
    }

    setMsg("Validado tecnicamente (pronto a enviar ao Presidente).");
    router.refresh();
  }

  async function techSendToPresident() {
    setMsg(null);

    setLoadingAction("SEND_PRESIDENT");
    const res = await fetch(`/api/backoffice/applications/${application.id}/send_to_president`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    setLoadingAction(null);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao enviar ao Presidente.");
      return;
    }

    setMsg("Enviado ao Presidente.");
    router.refresh();
  }

  // Revisão documentos (já tinhas)
  async function reviewDoc(doc: DocRow, decision: "APPROVE" | "REJECT") {
    setDocMsg(null);

    let comment: string | undefined = undefined;
    if (decision === "REJECT") {
      const c = (window.prompt("Motivo da rejeição (obrigatório):") ?? "").trim();
      if (!c) {
        setDocMsg("Rejeição cancelada: comentário obrigatório.");
        return;
      }
      comment = c;
    }

    setLoadingDocId(doc.id);
    const res = await fetch(`/api/backoffice/documents/${doc.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    });
    const data = await res.json().catch(() => ({}));
    setLoadingDocId(null);

    if (!res.ok || data?.ok !== true) {
      setDocMsg(data?.error ?? "Erro a rever documento.");
      return;
    }

    setDocMsg(decision === "APPROVE" ? "Documento aprovado." : "Documento rejeitado (pedido devolvido à entidade).");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Resumo */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-medium">Resumo</h2>
            <p className="text-sm text-neutral-900">{application.object_title}</p>
            <p className="text-xs text-neutral-600">
              {entity?.name ?? "Entidade"} {entity?.nif ? `• NIF ${entity.nif}` : ""} {category?.name ? `• ${category.name}` : ""}
            </p>

            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-neutral-600">
              <div>
                <span className="text-neutral-500">Valor solicitado:</span> {money(application.requested_amount)}
              </div>
              <div>
                <span className="text-neutral-500">Origem:</span> {application.origin ?? "-"}
              </div>
              <div>
                <span className="text-neutral-500">Criado:</span> {fmtDate(application.created_at)}
              </div>
              <div>
                <span className="text-neutral-500">Atualizado:</span> {fmtDate(application.updated_at)}
              </div>
            </div>
          </div>

          <span className="text-sm rounded-md border px-2 py-1">{status}</span>
        </div>

        {/* ✅ AÇÕES TECH (repõe o que desapareceu) */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            disabled={!canValidateTech || loadingAction !== null}
            onClick={techValidate}
            title="Passa para S5_TECH_VALIDATED"
          >
            {loadingAction === "VALIDATE" ? "..." : "Validar tecnicamente"}
          </button>

          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            disabled={!canReturnToEntity || loadingAction !== null}
            onClick={techReturnToEntity}
            title="Devolve à entidade (S4_RETURNED)"
          >
            {loadingAction === "RETURN" ? "..." : "Devolver à entidade"}
          </button>

          <button
            type="button"
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={!canSendToPresident || loadingAction !== null}
            onClick={techSendToPresident}
            title="Envia ao Presidente (S6_READY_FOR_PRESIDENT)"
          >
            {loadingAction === "SEND_PRESIDENT" ? "..." : "Enviar ao Presidente"}
          </button>

          {msg && <p className="text-sm ml-2 self-center">{msg}</p>}
        </div>
      </section>

      {/* Documentos */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Documentos</h2>

        {docMsg && <p className="mt-3 text-sm">{docMsg}</p>}

        <div className="mt-4 overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Tipo</th>
                <th className="py-2">Nome</th>
                <th className="py-2">Estado</th>
                <th className="py-2">Comentário</th>
                <th className="py-2">Data</th>
                <th className="py-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className="py-2">{docTypeNameById[d.document_type_id] ?? d.document_type_id}</td>
                  <td className="py-2">
                    <button className="underline" type="button" onClick={() => openDoc(d)}>
                      {d.original_name}
                    </button>
                  </td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">{d.review_comment ?? "-"}</td>
                  <td className="py-2">{d.uploaded_at ? fmtDate(d.uploaded_at) : "-"}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border px-3 py-1 disabled:opacity-60"
                        disabled={loadingDocId === d.id}
                        onClick={() => reviewDoc(d, "APPROVE")}
                      >
                        {loadingDocId === d.id ? "..." : "Aprovar"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border px-3 py-1 disabled:opacity-60"
                        disabled={loadingDocId === d.id}
                        onClick={() => reviewDoc(d, "REJECT")}
                      >
                        {loadingDocId === d.id ? "..." : "Rejeitar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {documents.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={6}>
                    Ainda não existem documentos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Histórico de revisões */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Histórico de revisões de documentos</h2>

        <div className="overflow-auto">
          <table className="min-w-[1100px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Documento</th>
                <th className="py-2">Decisão</th>
                <th className="py-2">Técnico</th>
                <th className="py-2">Data</th>
                <th className="py-2">Comentário</th>
              </tr>
            </thead>
            <tbody>
              {reviewHistory.map((r) => {
                const prof = reviewerById?.[r.decided_by];
                const who = prof?.full_name?.trim()
                  ? `${prof.full_name}${prof.email ? ` (${prof.email})` : ""}`
                  : prof?.email ?? r.decided_by;

                return (
                  <tr key={r.id} className="border-b">
                    <td className="py-2">{docNameById[r.document_id] ?? r.document_id}</td>
                    <td className="py-2">{r.decision}</td>
                    <td className="py-2">{who}</td>
                    <td className="py-2">{fmtDate(r.decided_at)}</td>
                    <td className="py-2">{r.comment ?? "-"}</td>
                  </tr>
                );
              })}

              {reviewHistory.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={5}>
                    Ainda não existem revisões.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Histórico de estados */}
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
                  <td className="py-2">{fmtDate(h.changed_at)}</td>
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
