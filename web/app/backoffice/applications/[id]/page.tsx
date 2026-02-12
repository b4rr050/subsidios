import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackofficeApplicationClient from "./ui";

type ParamsPromise = Promise<{ id: string }>;

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

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, category_id, object_title, requested_amount, approved_amount, current_status, origin, created_at, updated_at")
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (appErr || !app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Backoffice · Pedido</h1>
        <p className="mt-2 text-sm text-red-600">{appErr?.message ?? "Pedido não encontrado."}</p>
        <Link className="underline text-sm" href="/backoffice/applications">Voltar</Link>
      </div>
    );
  }

  const { data: entity } = await supabase
    .from("entities")
    .select("id, name, nif")
    .eq("id", app.entity_id)
    .single();

  const { data: category } = app.category_id
    ? await supabase.from("categories").select("id,name").eq("id", app.category_id).single()
    : { data: null as any };

  const { data: history } = await supabase
    .from("application_status_history")
    .select("id, from_status, to_status, changed_at, comment")
    .eq("application_id", app.id)
    .order("changed_at", { ascending: false })
    .limit(80);

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id,name,scope,is_active")
    .eq("is_active", true)
    .order("name");

  const { data: documents } = await supabase
    .from("documents")
    .select("id, document_type_id, storage_path, file_path, original_name, mime_type, size_bytes, status, uploaded_at, review_comment")
    .eq("application_id", app.id)
    .eq("is_deleted", false)
    .order("uploaded_at", { ascending: false })
    .limit(200);

  const { data: reviewHistory } = await supabase
    .from("document_review_history")
    .select("id, document_id, decision, comment, decided_by, decided_at")
    .eq("application_id", app.id)
    .order("decided_at", { ascending: false })
    .limit(200);

  const reviewerIds = Array.from(new Set((reviewHistory ?? []).map((r: any) => r.decided_by).filter(Boolean)));

  const reviewerById: Record<string, { email?: string | null; full_name?: string | null }> = {};
  if (reviewerIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id,email,full_name").in("id", reviewerIds);
    for (const p of profs ?? []) reviewerById[p.id] = { email: p.email, full_name: p.full_name };
  }

  // ✅ deliberação (se existir)
  const { data: deliberation } = await supabase
    .from("meeting_deliberations")
    .select("application_id, meeting_date, outcome, votes_for, votes_against, votes_abstain, voting_notes, approved_amount, deliberation_notes, deliberated_at")
    .eq("application_id", app.id)
    .maybeSingle();

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Backoffice · Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm" href="/backoffice/applications">Voltar</Link>

          <form
            action={async () => {
              "use server";
              const supabase = await createClient();
              await supabase.auth.signOut();
              redirect("/login");
            }}
          >
            <button className="rounded-md border px-3 py-2 text-sm">Sair</button>
          </form>
        </div>
      </header>

      <BackofficeApplicationClient
        application={app as any}
        entity={entity as any}
        category={category as any}
        history={(history ?? []) as any}
        documents={(documents ?? []) as any}
        documentTypes={(documentTypes ?? []) as any}
        reviewHistory={(reviewHistory ?? []) as any}
        reviewerById={reviewerById}
        deliberation={deliberation as any}
      />
    </div>
  );
}
