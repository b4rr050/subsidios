import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EntityListClient from "./EntityListClient";

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityHomePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const sp = await searchParams;
  const errRaw = sp?.err;
  const err = Array.isArray(errRaw) ? errRaw[0] : errRaw;

  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id, email, full_name")
    .eq("id", user.id)
    .single();

  if (profErr) redirect(`/entity?err=${encodeURIComponent(profErr.message)}`);

  const entityId = profile?.entity_id;
  if (!entityId) redirect("/unauthorized");

  const { data: apps, error: appsErr } = await supabase
    .from("applications")
    .select("id, object_title, requested_amount, current_status, created_at, updated_at, origin, category_id, is_deleted")
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(200);

  const { data: cats } = await supabase.from("categories").select("id, name").eq("is_active", true).order("name");

  const catNameById: Record<string, string> = {};
  for (const c of cats ?? []) catNameById[c.id] = c.name;

  return (
    <EntityListClient
      profile={{
        full_name: profile?.full_name ?? null,
        email: profile?.email ?? null,
      }}
      entityId={entityId}
      apps={(apps ?? []) as any}
      catNameById={catNameById}
      errorMsg={appsErr?.message ?? (err ? decodeURIComponent(err) : null)}
    />
  );
}
