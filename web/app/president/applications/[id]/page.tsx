import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PresidentApplicationClient from "./ui";

type ParamsPromise = Promise<{ id: string }>;

async function isPresident() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "PRESIDENT" });
  return data === true;
}

export default async function PresidentApplicationDetailPage({ params }: { params: ParamsPromise }) {
  if (!(await isPresident())) redirect("/unauthorized");

  const { id } = await params;
  const supabase = await createClient();

  const { data: app } = await supabase
    .from("applications")
    .select("id, entity_id, category_id, object_title, requested_amount, current_status, created_at, updated_at, origin")
    .eq("id", id)
    .single();

  if (!app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Pedido não encontrado.</p>
      </div>
    );
  }

  const { data: entity } = await supabase.from("entities").select("id,name,nif").eq("id", app.entity_id).single();
  const { data: category } = await supabase.from("categories").select("id,name").eq("id", app.category_id).single();

  const { data: documents } = await supabase
    .from("documents")
    .select("id, document_type_id, storage_path, file_path, original_name, mime_type, size_bytes, status, uploaded_at, review_comment")
    .eq("application_id", app.id)
    .eq("is_deleted", false)
    .order("uploaded_at", { ascending: false })
    .limit(200);

  const { data: decision } = await supabase
    .from("president_decisions")
    .select("application_id, decision, comment, decided_at")
    .eq("application_id", app.id)
    .maybeSingle();

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Presidente · Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
        </div>

        <a className="rounded-md border px-3 py-2 text-sm" href="/president">
          Voltar
        </a>
      </header>

      <PresidentApplicationClient
        application={app as any}
        entity={entity as any}
        category={category as any}
        documents={(documents ?? []) as any}
        decision={decision as any}
      />
    </div>
  );
}
