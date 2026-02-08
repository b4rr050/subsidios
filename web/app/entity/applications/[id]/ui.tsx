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

type App = {
  id: string;
  entity_id: string;
  category_id: string | null;
  object_title: string;
  requested_amount: number | null;
  current_status: string;
  created_at?: string | null;
  updated_at?: string | null;
  origin?: string | null;
};

type Category = { id: string; name: string };

type Hist = {
  id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
  comment: string | null;
};

type DebugDocTypes = {
  totalActive: number;
  applicationActive: number;
  error: string | null;
};

function money(v: any) {
  const n = Number(v ?? 0);
  return `${n.toFixed(2)} €`;
}

export default function ApplicationClient({
  application,
  categories,
  history,
  entityId,
  documentTypes,
  documents,
  debugDocTypes,
}: {
  application: App;
  categories: Category[];
  history: Hist[];
  entityId: string;
  documentTypes: DocType[];
  documents: DocRow[];
  debugDocTypes: DebugDocTypes;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [categoryId, setCategoryId] = useState(application.category_id ?? "");
  const [objectTitle, setObjectTitle] = useState(application.object_title ?? "");
  const [requestedAmount, setRequestedAmount] = useState<string>(
    application.requested_amount != null ? String(application.requested_amount) : ""
  );

  const [docTypeId, setDocTypeId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [docMsg, setDocMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const status = application.current_status;

  const docTypeNameById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of documentTypes ?? []) m[t.id] = t.name;
    return m;
  }, [documentTypes]);

  const canEditCore = status === "S1_DRAFT" || status === "S4_RETURNED";
  const canUploadApplicationDocs = status === "S1_DRAFT" || status === "S4_RETURNED";
  const canDeleteDraft = status === "S1_DRAFT";

  async function openDoc(d: DocRow) {
    setDocMsg(null);
    const path = d.storage_path ?? d.file_path ?? null;

    if (!path) {
      setDocMsg("Documento sem caminho no storage.");
      return;
    }

    const { data, error } = await supabase.storage.from("docs").createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      setDocMsg(error?.message ?? "Erro a abrir documento.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditCore) return;

    setMsg(null);
    setLoading(true);

    const res = await fetch(`/api/entity/applications/${application.id}/update`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category_id: categoryId || null,
        object_title: objectTitle,
        requested_amount: requestedAmount ? Number(requestedAmount) : null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao guardar.");
      return;
    }

    setMsg("Guardado com sucesso.");
    router.refresh();
  }

  async function onSubmitApplication() {
    setMsg(null);
    setLoading(true);

    const res = await fetch(`/api/entity/applications/${application.id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao submeter pedido.");
      return;
    }

    setMsg("Pedido submetido.");
    router.refresh();
  }

  async function onUploadDoc(e: React.FormEvent) {
    e.preventDefault();
    setDocMsg(null);

    if (!canUploadApplicationDocs) {
      setDocMsg("Não é possível anexar documentos neste estado.");
      return;
    }
    if (!docTypeId) {
      setDocMsg("Seleciona o tipo de documento.");
      return;
    }
    if (!file) {
      setDocMsg("Seleciona um ficheiro.");
      return;
    }

    setLoading(true);

    // Upload ao storage
    const safeName = file.name.replace(/[^\w.\-() ]+/g, "_");
    const storagePath = `applications/${application.id}/${Date.now()}_${safeName}`;

    const up = await supabase.storage.from("docs").upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });

    if (up.error) {
      setLoading(false);
      setDocMsg(up.error.message);
      return;
    }

    // Registo na tabela documents
    const res = await fetch(`/api/entity/applications/${application.id}/documents/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        document_type_id: docTypeId,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size ?? null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok || data?.ok !== true) {
      setDocMsg(data?.error ?? "Erro ao gravar registo do documento.");
      return;
    }

    setDocMsg("Documento submetido.");
    setFile(null);
    setDocTypeId("");
    router.refresh();
  }

  async function onDeleteDraft() {
    if (!canDeleteDraft) return;

    const ok1 = window.confirm("Eliminar este pedido em rascunho? (a entidade deixa de o ver)");
    if (!ok1) return;

    const ok2 = window.confirm("Confirma: queres mesmo ELIMINAR este rascunho?");
    if (!ok2) return;

    setDeleting(true);

    const res = await fetch(`/api/entity/applications/${application.id}/delete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json().catch(() => ({}));
    setDeleting(false);

    if (!res.ok || data?.ok !== true) {
      setMsg(data?.error ?? "Erro ao eliminar rascunho.");
      return;
    }

    router.replace("/entity");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Pedido */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-medium">Pedido</h2>
            <p className="text-xs text-neutral-500">
              ID: {application.id} • Origem: {application.origin ?? "-"}
            </p>
            <p className="text-xs text-neutral-500">
              Criado: {application.created_at ? new Date(application.created_at).toLocaleString() : "-"} • Atualizado:{" "}
              {application.updated_at ? new Date(application.updated_at).toLocaleString() : "-"}
            </p>
            {/* entityId só para consistência/debug (não precisa de aparecer muito) */}
            <p className="text-[11px] text-neutral-400">Entidade: {entityId}</p>
          </div>

          <span className="text-sm rounded-md border px-2 py-1">{status}</span>
        </div>

        <form onSubmit={onSave} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm">Categoria</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={!canEditCore}
            >
              <option value="">(Sem categoria)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm">Título / Objeto</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={objectTitle}
              onChange={(e) => setObjectTitle(e.target.value)}
              disabled={!canEditCore}
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm">Valor solicitado</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(e.target.value)}
              disabled={!canEditCore}
              inputMode="decimal"
              placeholder="0"
            />
            <p className="text-xs text-neutral-500">Atual: {money(application.requested_amount)}</p>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md border px-3 py-2 text-sm disabled:opacity-60"
              disabled={!canEditCore || loading}
            >
              {loading ? "A guardar..." : "Guardar"}
            </button>

            <button
              type="button"
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
              disabled={loading || status !== "S1_DRAFT"}
              onClick={onSubmitApplication}
            >
              {loading ? "..." : "Submeter"}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm text-red-700 disabled:opacity-60"
              disabled={!canDeleteDraft || deleting}
              onClick={onDeleteDraft}
              title="Só disponível em S1_DRAFT"
            >
              {deleting ? "A eliminar..." : "Eliminar rascunho"}
            </button>
          </div>

          {msg && <p className="text-sm mt-2">{msg}</p>}
        </form>

        {/* Debug dos doc types (discreto) */}
        <p className="mt-3 text-xs text-neutral-500">
          Tipos ativos: {debugDocTypes.applicationActive} | APPLICATION: {debugDocTypes.applicationActive}
          {debugDocTypes.error ? ` | Erro: ${debugDocTypes.error}` : ""}
        </p>
      </section>

      {/* Documentos */}
      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium">Documentos (Candidatura)</h2>

        <form onSubmit={onUploadDoc} className="mt-4 space-y-3">
          <div className="space-y-1">
            <label className="text-sm">Tipo de documento</label>
            <select
              className="w-full rounded-md border px-3 py-2"
              value={docTypeId}
              onChange={(e) => setDocTypeId(e.target.value)}
              disabled={!canUploadApplicationDocs || loading}
            >
              <option value="">{documentTypes.length ? "(Selecionar)" : "(Sem tipos configurados)"}</option>
              {documentTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm">Ficheiro</label>
            <input
              className="w-full rounded-md border px-3 py-2"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={!canUploadApplicationDocs || loading}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60"
            disabled={!canUploadApplicationDocs || loading}
          >
            {loading ? "A enviar..." : "Enviar documento"}
          </button>

          {docMsg && <p className="text-sm mt-2">{docMsg}</p>}
        </form>

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
                    <div className="text-xs text-neutral-500">{docTypeNameById[d.document_type_id] ?? "-"}</div>
                  </td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2">{d.review_comment ?? "-"}</td>
                  <td className="py-2">{d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : "-"}</td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td className="py-3 text-neutral-600" colSpan={4}>
                    Ainda não existem documentos.
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
