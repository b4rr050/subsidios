import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginClient from "./ui";

export default async function LoginPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // se já está logado, manda para "/"
  if (user) redirect("/");

  return <LoginClient />;
}
