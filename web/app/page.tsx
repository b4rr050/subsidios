import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // prioridade (se alguém tiver mais do que um role)
  const isAdmin = (await supabase.rpc("has_role", { role: "ADMIN" })).data === true;
  const isPresident = (await supabase.rpc("has_role", { role: "PRESIDENT" })).data === true;
  const isTech = (await supabase.rpc("has_role", { role: "TECH" })).data === true;
  const isEntity = (await supabase.rpc("has_role", { role: "ENTITY" })).data === true;

  if (isAdmin) redirect("/admin/users");
  if (isPresident) redirect("/president");
  if (isTech) redirect("/backoffice/applications");
  if (isEntity) redirect("/entity");

  redirect("/unauthorized");
}
