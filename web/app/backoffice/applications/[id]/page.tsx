import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackofficeApplicationClient from "./ui";

type ParamsPromise = Promise<{ id: string }>;

async function isTechOrAdmin() {
  const supabase = await createClient();
  const tech = await supabase.rpc("has_role", { role: "TECH" });
  const admin = await supabase.rpc("has_role", { role: "ADMIN" });
  return tech.data === true || admin.data === true;
}

export default async function BackofficeApplicationDetailPage({ params }: { params: ParamsPromise }) {
  if (!(await isTechOrAdmin())) redirect("/unauthorized");

  const { id: appId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select(
      "id, entity_id, category_id, object_title, requested_amount, current_status, created_at, updated_at, origin"
    )
    .eq("id", appId)
    .single();

  if (appErr || !app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Pedido não encontrado.</p>
      </div>
    );
  }

  const { data: entity } = await supabase
    .from("entities")
    .select("id, name, nif")
    .eq("id", app.entity_id)
    .single();

  const { data: category } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", app.category_id)
    .single();

  const { data: history } = await supabase
    .from("application_status_history")
    .select("id, from_status, to_status, changed_at, comment")
    .eq("application_id", app.id)
    .order("changed_at", { ascending: false })
    .limit(50);

  // ✅ IMPORTANTE: trazer storage_path para abrir documentos
  const { data: documents } = await supabase
    .from("documents")
    .select(
      "id, document_type_id, storage_path, file_path, original_name, mime_type, size_bytes, status, uploaded_at, review_comment"
    )
    .eq("application_id", app.id)
    .eq("is_deleted", false)
    .order("uploaded_at", { ascending: false })
    .limit(500);

  const { data: docTypes } = await supabase
    .from("document_types")
    .select("id, name, scope, is_active")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Backoffice • Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
          <p className="text-xs text-neutral-500">
            {entity?.name ?? "Entidade"} {entity?.nif ? `• NIF ${entity.nif}` : ""}{" "}
            {category?.name ? `• ${category.name}` : ""}
          </p>
        </div>

        <a className="rounded-md border px-3 py-2 text-sm" href="/backoffice/applications">
          Voltar
        </a>
      </header>

      <BackofficeApplicationClient
        application={app as any}
        entity={entity as any}
        category={category as any}
        history={(history ?? []) as any}
        documents={(documents ?? []) as any}
        documentTypes={(docTypes ?? []) as any}
      />
    </div>
  );
}
