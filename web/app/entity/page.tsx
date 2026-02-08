import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EntityHomeClient from "./ui";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityHomePage() {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("entity_id").eq("id", user.id).single();
  const entityId = profile?.entity_id;
  if (!entityId) redirect("/unauthorized");

  const { data: apps } = await supabase
    .from("applications")
    .select("id, object_title, requested_amount, current_status, created_at")
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(50);

  return <EntityHomeClient applications={(apps ?? []) as any} />;
}
