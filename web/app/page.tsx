import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: roles, error } = await supabase.rpc("my_roles");

  if (error) {
    // fallback: se falhar, manda para uma página neutra
    redirect("/unauthorized");
  }

  const r = new Set((roles ?? []).map(String));

  if (r.has("ADMIN")) redirect("/admin/users");
  if (r.has("TECH")) redirect("/backoffice/applications");
  if (r.has("ENTITY")) redirect("/entity");

  // Se não tiver role nenhum
  redirect("/unauthorized");
}
