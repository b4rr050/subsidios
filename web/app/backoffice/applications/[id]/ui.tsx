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

type Deliberation = {
  application_id: string;
  meeting_date: string;
  outcome: "APPROVED" | "REJECTED";
  votes_for: number | null;
  votes_against: number | null;
  votes_abstain: number | null;
  voting_notes: string | null;
  approved_amount: number | null;
  deliberation_notes: string | null;
  deliberated_at: string | null;
} | null;

type App = {
  id: string;
  object_title: string;
  requested_amount: number | null;
  approved_amount: number | null;
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
  deliberation,
}: {
  application: App;
  entity: Entity | null;
  category: Category | null;
  history: Hist[];
  documents: DocRow[];
  documentTypes: DocType[];
  reviewHistory: ReviewRow[];
  reviewerById: Record<string, { email?: string | null; full_name?: string | null }>;
  deliberation: Deliberation;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [msg, setMsg] = useState<string | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

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

  async function openDoc(d: DocRow) {
    setDocMsg(null);
    const path = d.storage_path ?? d.file_path ?? null;

    if (!path) {
      setDocMsg("Documento sem caminho no storage.");
      return;
    }

    const { data, error } = await supabase.storage.from("docs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      setDocMsg(error?.message ?? "Erro a gerar link.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function reviewDoc(doc: DocRow, decision: "APPROVE" | "REJECT") {
    setDocMsg(null);

    let comment: string | undefined;
    if (decision === "REJECT") {
      const c = window.prompt("Motivo da rejeição (obrigatório):") ?? "";
      if (!c.trim()) return;
      comment = c.trim();
    }

    setLoading(doc.id);

    const res = await fetch(`/api/backoffice/documents/${doc.id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, comment }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(null);

    if (!res.ok || data?.ok !== true) {
      setDocMsg(data?.error ?? "Erro a rever documento.");
      return;
    }

    setDocMsg(decision === "APPROVE" ? "Documento aprovado." : "Documento rejeitado (pedido devolvido à entidade).");
    router.refresh();
  }

  // -------- Deliberação (Tech) --------
  const showDeliberationForm = status === "S8_SENT_TO_MEETING" || status === "S9_DELIBERATED" || status === "S10_AWAITING_EXPENSE" || status === "S15_CLOSED";

  const [meetingDate, setMeetingDate] = useState<string>(deliberation?.meeting_date ?? "");
  const [outcome, setOutcome] = useState<"APPROVED" | "REJECTED">(deliberation?.outcome ?? "APPROVED");
  const [votesFor, setVotesFor] = useState<string>(deliberation?.votes_for != null ? String(deliberation.votes_for) : "");
  const [votesAgainst, setVotesAgainst] = useState<string>(deliberation?.votes_against != null ? String(deliberation.votes_against) : "");
  const [votesAbstain, setVotesAbstain] = useState<string>(deliberation?.votes_abstain != null ? String(deliberation.votes_abstain) : "");
  const [approvedAmount, setApprovedAmount] = useState<string>(deliberation?.approved_amount != null ? String(deliberation.approved_amount) : "");
  const [votingNotes, setVotingNotes] = useState<string>(deliberation?.voting_notes ?? "");
  const [delibNotes, setDelibNotes] = useState<string>(deliberation?.deliberation_notes ?? "");
  const [notifyEntity, setNotifyEntity] = useState<boolean>(true);

  async function saveDeliberation(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    if (!meetingDate) {
      setMsg("Indica a data da reunião.");
      return;
    }

    setLoading("deliberate");

    const res = await fetch(`/api/backoffice/applications/${application.id}/deliberate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        meeting_date: meetingDate,
        outcome,
        votes_for: votesFor === "" ? null : Number(votesFor),
        votes_against: votesAgainst === "" ? null : Number(votesAgainst),
        votes_abstain: votesAbstain === "" ? null : Number(votesAbstain),
        approved_amount: approvedAmount === "" ? null : Number(approvedAmount),
        voting_notes: votingNotes || null,
        deliberation_notes: delibNotes || null,
        notify_entity: notifyEntity,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(null);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao registar deliberação.");
      return;
    }

    if (data?.warning) setMsg(`Deliberação registada. Aviso: ${data.warning}`);
    else setMsg("Deliberação registada com sucesso.");

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
              <div><span className="text-neutral-500">Valor solicitado:</span> {money(application.requested_amount)}</div>
              <div><span className="text-neutral-500">Valor aprovado:</span> {application.approved_amount != null ? money(application.approved_amount) : "-"}</div>
              <div><span className="text-neutral-500">Origem:</span> {application.origin ?? "-"}</div>
              <div><span className="text-neutral-500">Criado:</span> {fmtDate(application.created_at)}</div>
              <div><span className="text-neutral-500">Atualizado:</span> {fmtDate(application.updated_at)}</div>
              <div className="col-span-2"><span className="text-neutral-500">ID:</span> {application.id}</div>
            </div>

            {msg && <p className="mt-3 text-sm">{msg}</p>}
          </div>

          <span className="text-sm rounded-md border px-2 py-1">{status}</span>
        </div>
      </section>

      {/* Deliberação */}
      {showDeliberationForm && (
        <section className="rounded-2xl border p-4 shadow-sm">
          <h2 className="font-medium">Reunião de Câmara · Deliberação</h2>

          {status !== "S8_SENT_TO_MEETING" && deliberation && (
            <p className="mt-2 text-sm text-neutral-600">
              Deliberação registada em {fmtDate(deliberation.deliberated_at)} · Resultado: <b>{deliberation.outcome}</b>
            </p>
          )}

          <form onSubmit={saveDeliberation} className="mt-4 grid gap-3">
            <div className="grid gap-1">
              <label className="text-sm">Data da reunião</label>
              <input
                type="date"
                className="rounded-md border px-3 py-2"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                disabled={loading !== null}
              />
            </div>

            <div className="grid gap-1">
              <label className="text-sm">Resultado</label>
              <select
                className="rounded-md border px-3 py-2"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as any)}
                disabled={loading !== null}
              >
                <option value="APPROVED">Aprovado</option>
                <option value="REJECTED">Rejeitado</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="grid gap-1">
                <label className="text-sm">Votos a favor</label>
                <input className="rounded-md border px-3 py-2" value={votesFor} onChange={(e) => setVotesFor(e.target.value)} inputMode="numeric" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Votos contra</label>
                <input className="rounded-md border px-3 py-2" value={votesAgainst} onChange={(e) => setVotesAgainst(e.target.value)} inputMode="numeric" />
              </div>
              <div className="grid gap-1">
                <label className="text-sm">Abstenções</label>
                <input className="rounded-md border px-3 py-2" value={votesAbstain} onChange={(e) => setVotesAbstain(e.target.value)} inputMode="numeric" />
              </div>
            </div>

            <div className="grid gap-1">
              <label className="text-sm">Valor aprovado (€) (se aplicável)</label>
              <input className="rounded-md border px-3 py-2" value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} inputMode="decimal" />
            </div>

            <div className="grid gap-1">
              <label className="text-sm">Notas de votação</label>
              <input className="rounded-md border px-3 py-2" value={votingNotes} onChange={(e) => setVotingNotes(e.target.value)} />
            </div>

            <div className="grid gap-1">
              <label className="text-sm">Observações / Deliberação</label>
              <textarea className="rounded-md border px-3 py-2 min-h-[90px]" value={delibNotes} onChange={(e) => setDelibNotes(e.target.value)} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={notifyEntity} onChange={(e) => setNotifyEntity(e.target.checked)} />
              Notificar entidade por email (perfis ativos da entidade)
            </label>

            <button
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading !== null || status !== "S8_SENT_TO_MEETING"}
              title={status === "S8_SENT_TO_MEETING" ? "" : "Só disponível em S8_SENT_TO_MEETING"}
            >
              {loading === "deliberate" ? "A registar..." : "Registar deliberação"}
            </button>

            {status !== "S8_SENT_TO_MEETING" && (
              <p className="text-xs text-neutral-600">
                Nota: para registar deliberação, o pedido tem de estar em <b>S8_SENT_TO_MEETING</b>.
              </p>
            )}
          </form>
        </section>
      )}

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
                  <td className="py-2">{fmtDate(d.uploaded_at)}</td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border px-3 py-1 disabled:opacity-60"
                        disabled={loading === d.id}
                        onClick={() => reviewDoc(d, "APPROVE")}
                      >
                        {loading === d.id ? "..." : "Aprovar"}
                      </button>
                      <button
                        type="button"
                        className="rounded-md border px-3 py-1 disabled:opacity-60"
                        disabled={loading === d.id}
                        onClick={() => reviewDoc(d, "REJECT")}
                      >
                        {loading === d.id ? "..." : "Rejeitar"}
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
