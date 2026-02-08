import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplicationClient from "./ui";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", userData.user.id)
    .single();

  const entityId = profile?.entity_id;
  if (profErr || !entityId) redirect("/unauthorized");

  const appId = params.id;

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, category_id, object_title, requested_amount, current_status, created_at, updated_at, origin")
    .eq("id", appId)
    .single();

  if (appErr || !app) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Pedido</h1>
        <p className="mt-2 text-sm text-red-600">Pedido não encontrado.</p>
        <div className="mt-3 text-xs text-neutral-600">
          <p><b>ID pedido:</b> {appId}</p>
          <p><b>Erro:</b> {appErr?.message ?? "sem erro (null)"} </p>
        </div>
      </div>
    );
  }

  if (app.entity_id !== entityId) redirect("/unauthorized");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  const { data: history } = await supabase
    .from("application_status_history")
    .select("id, from_status, to_status, changed_at, comment")
    .eq("application_id", app.id)
    .order("changed_at", { ascending: false })
    .limit(20);

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pedido</h1>
          <p className="text-sm text-neutral-600">{app.id}</p>
        </div>
        <a className="rounded-md border px-3 py-2 text-sm" href="/entity">
          Voltar
        </a>
      </header>

      <ApplicationClient application={app} categories={categories ?? []} history={history ?? []} />
    </div>
  );
}
