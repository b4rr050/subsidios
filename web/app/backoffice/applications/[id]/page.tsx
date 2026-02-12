import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackofficeApplicationClient from "./ui";

type ParamsPromise = Promise<{ id: string }>;

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

async function isTechOrAdmin() {
  const supabase = await createClient();
  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  return a.data === true || t.data === true;
}

export default async function BackofficeApplicationDetailPage({ params }: { params: ParamsPromise }) {
  if (!(await isTechOrAdmin())) redirect("/unauthorized");

  const { id } = await params;
  const supabase = await createClient();

  // auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // app
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, object_title, requested_amount, current_status, origin, created_at, updated_at, entity_id, category_id, is_deleted")
    .eq("id", id)
    .single();

  if (appErr || !app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Backoffice · Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Erro: {appErr?.message ?? "Pedido não encontrado."}</p>
      </div>
    );
  }

  if (app.is_deleted) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Backoffice · Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Pedido eliminado.</p>
      </div>
    );
  }

  // entity
  const { data: entity } = await supabase
    .from("entities")
    .select("id,name,nif")
    .eq("id", app.entity_id)
    .maybeSingle();

  // category
  const { data: category } = await supabase
    .from("categories")
    .select("id,name")
    .eq("id", app.category_id)
    .maybeSingle();

  // status history
  const { data: history } = await supabase
    .from("application_status_history")
    .select("id, from_status, to_status, changed_at, comment")
    .eq("application_id", app.id)
    .order("changed_at", { ascending: false })
    .limit(100);

  // document types (ativos)
  const { data: allDocTypes } = await supabase
    .from("document_types")
    .select("id, name, scope, is_active")
    .eq("is_active", true)
    .order("name");

  const documentTypes =
    (allDocTypes ?? []).filter((d) => String(d.scope).trim().toUpperCase() === "APPLICATION") ?? [];

  // documents
  const { data: documents } = await supabase
    .from("documents")
    .select("id, document_type_id, storage_path, file_path, original_name, mime_type, size_bytes, status, uploaded_at, review_comment, is_deleted")
    .eq("application_id", app.id)
    .eq("is_deleted", false)
    .order("uploaded_at", { ascending: false })
    .limit(500);

  // review history
  const { data: reviewHistory } = await supabase
    .from("document_review_history")
    .select("id, document_id, decision, comment, decided_by, decided_at")
    .eq("application_id", app.id)
    .order("decided_at", { ascending: false })
    .limit(500);

  // load reviewer profiles
  const reviewerIds = Array.from(new Set((reviewHistory ?? []).map((r) => r.decided_by).filter(Boolean)));
  let reviewerById: Record<string, { email?: string | null; full_name?: string | null }> = {};

  if (reviewerIds.length > 0) {
    const { data: reviewers } = await supabase
      .from("profiles")
      .select("id,email,full_name")
      .in("id", reviewerIds);

    reviewerById =
      (reviewers ?? []).reduce((acc: any, p: any) => {
        acc[p.id] = { email: p.email ?? null, full_name: p.full_name ?? null };
        return acc;
      }, {}) ?? {};
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Backoffice · Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
        </div>

        <a className="rounded-md border px-3 py-2 text-sm" href="/backoffice/applications">
          Voltar
        </a>
      </header>

      <BackofficeApplicationClient
        application={app as unknown as App}
        entity={entity as unknown as Entity | null}
        category={category as unknown as Category | null}
        history={(history ?? []) as unknown as Hist[]}
        documents={(documents ?? []) as unknown as DocRow[]}
        documentTypes={(documentTypes ?? []) as unknown as DocType[]}
        reviewHistory={(reviewHistory ?? []) as unknown as ReviewRow[]}
        reviewerById={reviewerById}
      />
    </div>
  );
}
