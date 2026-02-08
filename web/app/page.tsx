import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: isAdmin }, { data: isTech }, { data: isEntity }] = await Promise.all([
    supabase.rpc("has_role", { role: "ADMIN" }),
    supabase.rpc("has_role", { role: "TECH" }),
    supabase.rpc("has_role", { role: "ENTITY" }),
  ]);

  if (isAdmin === true) redirect("/admin/users");
  if (isTech === true) redirect("/backoffice/applications");
  if (isEntity === true) redirect("/entity");

  redirect("/unauthorized");
}
