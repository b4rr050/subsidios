import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplicationClient from "./ui";

type ParamsPromise = Promise<{ id: string }>;

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityApplicationDetailPage({ params }: { params: ParamsPromise }) {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const { id: appId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("entity_id").eq("id", user.id).single();
  const entityId = profile?.entity_id;
  if (!entityId) redirect("/unauthorized");

  const { data: app } = await supabase
    .from("applications")
    .select("id, entity_id, category_id, object_title, requested_amount, current_status, created_at, updated_at, origin")
    .eq("id", appId)
    .single();

  if (!app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Pedido não encontrado.</p>
        <a className="mt-4 inline-block rounded-md border px-3 py-2 text-sm" href="/entity">
          Voltar
        </a>
      </div>
    );
  }

  if (app.entity_id !== entityId) redirect("/unauthorized");

  const { data: categories } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");

  const { data: history } = await supabase
    .from("application_status_history")
    .select("id, from_status, to_status, changed_at, comment")
    .eq("application_id", app.id)
    .order("changed_at", { ascending: false })
    .limit(50);

  const { data: allDocTypes } = await supabase
    .from("document_types")
    .select("id, name, scope, is_active")
    .eq("is_active", true)
    .order("name");

  const documentTypes = (allDocTypes ?? []).filter((d) => String(d.scope).trim().toUpperCase() === "APPLICATION");

  const { data: documents } = await supabase
    .from("documents")
    .select("id, document_type_id, storage_path, file_path, original_name, mime_type, size_bytes, status, uploaded_at, review_comment")
    .eq("application_id", app.id)
    .eq("is_deleted", false)
    .order("uploaded_at", { ascending: false })
    .limit(200);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
        </div>

        {/* ✅ VOLTAR SEMPRE À LISTA */}
        <a className="rounded-md border px-3 py-2 text-sm" href="/entity">
          Voltar
        </a>
      </header>

      <ApplicationClient
        application={app as any}
        categories={(categories ?? []) as any}
        history={(history ?? []) as any}
        entityId={entityId}
        documentTypes={documentTypes as any}
        documents={(documents ?? []) as any}
        debugDocTypes={{ totalActive: 0, applicationActive: 0, error: null }}
      />
    </div>
  );
}
