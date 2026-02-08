import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackofficeAppClient from "./ui";

type ParamsPromise = Promise<{ id: string }>;

async function isTechOrAdmin() {
  const supabase = await createClient();
  const a = await supabase.rpc("has_role", { role: "ADMIN" });
  const t = await supabase.rpc("has_role", { role: "TECH" });
  return a.data === true || t.data === true;
}

export default async function BackofficeApplicationDetailPage({
  params,
}: {
  params: ParamsPromise;
}) {
  if (!(await isTechOrAdmin())) redirect("/unauthorized");

  const { id: appId } = await params;

  const supabase = await createClient();

  const { data: app, error } = await supabase
    .from("applications")
    .select(
      `
      id,
      object_title,
      requested_amount,
      current_status,
      created_at,
      updated_at,
      submitted_at,
      entity_id,
      category_id,
      origin,
      entities(id,name,nif,email,phone),
      categories(id,name)
    `
    )
    .eq("id", appId)
    .single();

  if (error || !app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Pedido não encontrado.</p>
      </div>
    );
  }

  const { data: statusHistory } = await supabase
    .from("application_status_history")
    .select("id, from_status, to_status, changed_at, changed_by, comment")
    .eq("application_id", appId)
    .order("changed_at", { ascending: false })
    .limit(50);

  const { data: changeLog } = await supabase
    .from("application_change_log")
    .select("id, field, old_value, new_value, changed_at, changed_by")
    .eq("application_id", appId)
    .order("changed_at", { ascending: false })
    .limit(200);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
        </div>
        <a className="rounded-md border px-3 py-2 text-sm" href="/backoffice/applications">
          Voltar
        </a>
      </header>

      <BackofficeAppClient app={app} statusHistory={statusHistory ?? []} changeLog={changeLog ?? []} />
    </div>
  );
}
