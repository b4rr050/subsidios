import { ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function EntityLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <Link href="/entity" className="font-semibold">
          Subsídios · Entidade
        </Link>

        <form action="/api/auth/logout" method="post">
          <button className="rounded-md border px-3 py-1 text-sm">
            Logout
          </button>
        </form>
      </header>

      <main className="p-6">{children}</main>
    </div>
  );
}
