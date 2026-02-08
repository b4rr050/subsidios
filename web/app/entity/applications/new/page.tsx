import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NewApplicationClient from "./ui";

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function NewEntityApplicationPage() {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Novo pedido (avulso)</h1>
      <NewApplicationClient categories={categories ?? []} />
    </div>
  );
}
