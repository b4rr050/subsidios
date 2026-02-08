"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string };
type DocType = { id: string; code: string; name: string; scope: string };
type DocRow = {
  id: string;
  document_type_id: string;
  file_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  uploaded_at: string;
  review_comment: string | null;
};

type App = {
  id: string;
  category_id: string;
  object_title: string;
  requested_amount: number | null;
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
function canUploadDocs(status: string) {
  // Docs candidatura: enquanto o pedido estiver numa fase ainda “aberta”
  return canEdit(status);
}

export default function ApplicationClient({
  application,
  categories,
  history,
  entityId,
  documentTypes,
  documents,
}: {
  application: App;
  categories: Category[];
  history: Hist[];
  entityId: string;
  documentTypes: DocType[];
  documents: DocRow[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [categoryId, setCategoryId] = useState(application.category_id ?? "");
  const [title, setTitle] = useState(application.object_title ?? "");
  const [amount, setAmount] = useState(String(application.requested_amount ?? 0));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [docTypeId, setDocTypeId] = useState(documentTypes[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);

  const editable = useMemo(() => canEdit(application.current_status), [application.current_status]);
  const submittable = useMemo(() => canSubmit(application.current_status), [application.current_status]);
  const uploadable = useMemo(() => canUploadDocs(application.current_status), [application.current_status]);

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

    const res = await fetch(`/api/entity/applications/${application.id}/submit`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao submeter");
      return;
    }

    setMsg("Submetido.");
    router.refresh();
  }

  async function openDoc(path: string) {
    const { data, error } = await supabase.storage.from("docs").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      setDocMsg("Erro a gerar link para abrir documento.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function uploadDocument(e: React.FormEvent) {
    e.preventDefault();
    setDocMsg(null);

    if (!uploadable) {
      setDocMsg("Upload bloqueado: pedido já foi validado tecnicamente (ou está fora da fase).");
      return;
    }
    if (!docTypeId) {
      setDocMsg("Escolhe o tipo de documento.");
      return;
    }
    if (!file) {
      setDocMsg("Seleciona um ficheiro.");
      return;
    }

    setLoading(true);

    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const filePath = `entities/${entityId}/applications/${application.id}/${docTypeId}/${crypto.randomUUID()}-${safeName}`;

    const up = await supabase.storage.from("docs").upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

    if (up.error) {
      setLoading(false);
      setDocMsg(up.error.message);
      return;
    }

    const res = await fetch(`/api/entity/applications/${application.id}/documents/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document_type_id: docTypeId,
        file_path: filePath,
        original_name: file.name,
        mime_type: file.type ?? null,
        size_bytes: file.size ?? null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setDocMsg(data?.error ?? "Erro ao gravar registo do documento.");
      return;
    }

    setFile(null);
    setDocMsg("Documento submetido (PENDING).");
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      {/* DADOS */}
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
              <option value="" disabled>
                Selecionar…
              </option>
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
            <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-60" disabled={!editable || loading}>
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
        </form>
      </section>

      {/* DOCUMENTOS (SEMPRE VISÍVEL) */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Documentos (Candidatura)</h2>

        <form onSubmit={uploadDocument} className="mt-4 grid gap-3 max-w-2xl">
          <div className="grid gap-2">
            <label className="text-sm">Tipo de documento</label>
            <select
              className="rounded-md border px-3 py-2"
              value={docTypeId}
              onChange={(e) => setDocTypeId(e.target.value)}
              disabled={!uploadable || loading || documentTypes.length === 0}
            >
              {documentTypes.length === 0 ? (
                <option value="">(Sem tipos configurados)</option>
              ) : (
                documentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm">Ficheiro</label>
            <input
              type="file"
              className="rounded-md border px-3 py-2 text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!uploadable || loading || documentTypes.length === 0}
            />
          </div>

          {docMsg && <p className="text-sm">{docMsg}</p>}

          <button
            type="submit"
            className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={!uploadable || loading || documentTypes.length === 0}
          >
            {loading ? "A enviar..." : "Enviar documento"}
          </button>

          {!uploadable && (
            <p className="text-xs text-neutral-600">
              Upload bloqueado: pedido já não está numa fase aberta. Pede reabertura ao técnico.
            </p>
          )}
        </form>

        <div className="mt-6 overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
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
                  <td className="py-2">{d.original_name}</td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">{d.review_comment ?? "-"}</td>
                  <td className="py-2">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : "-"}</td>
                  <td className="py-2">
                    <button className="underline" type="button" onClick={() => openDoc(d.file_path)}>
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={5}>
                    Ainda não existem documentos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* HISTÓRICO */}
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
