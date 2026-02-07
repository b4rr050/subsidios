import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CreateUserClient from "./CreateUserClient";

type RoleCode = "ADMIN" | "TECH" | "VALIDATOR" | "PRESIDENT" | "ENTITY";

async function isAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_role", { role: "ADMIN" });
  if (error) return false;
  return data === true;
}

export default async function AdminUsersPage() {
  if (!(await isAdmin())) redirect("/unauthorized");

  const supabase = await createClient();

  const profilesRes = await supabase
    .from("profiles")
    .select("id, full_name, email, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const rolesRes = await supabase.from("roles").select("id, code").order("code");
  const userRolesRes = await supabase.from("user_roles").select("user_id, role_id").limit(2000);

  const profiles = profilesRes.data ?? [];
  const roles = rolesRes.data ?? [];
  const userRoles = userRolesRes.data ?? [];

  const roleById = new Map<string, RoleCode>(roles.map((r) => [r.id, r.code as RoleCode]));
  const rolesByUser = new Map<string, RoleCode[]>();

  for (const ur of userRoles) {
    const role = roleById.get(ur.role_id);
    if (!role) continue;
    const list = rolesByUser.get(ur.user_id) ?? [];
    list.push(role);
    rolesByUser.set(ur.user_id, list);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin · Utilizadores</h1>

        <form
          action={async () => {
            "use server";
            const supabase = await createClient();
            await supabase.auth.signOut();
            redirect("/login");
          }}
        >
          <button className="rounded-md border px-3 py-2 text-sm">Sair</button>
        </form>
      </header>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Criar utilizador</h2>
        <CreateUserClient />
      </section>

      <section className="rounded-2xl border p-4 shadow-sm">
        <h2 className="font-medium mb-3">Últimos utilizadores</h2>

        <div className="overflow-auto">
          <table className="min-w-[800px] w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Nome</th>
                <th className="py-2">Email</th>
                <th className="py-2">Roles</th>
                <th className="py-2">Entity ID</th>
                <th className="py-2">Criado</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2">{p.full_name ?? "-"}</td>
                  <td className="py-2">{p.email ?? "-"}</td>
                  <td className="py-2">{(rolesByUser.get(p.id) ?? []).join(", ") || "-"}</td>
                  <td className="py-2 font-mono text-xs">{p.entity_id ?? "-"}</td>
                  <td className="py-2">{p.created_at ? new Date(p.created_at).toLocaleString() : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(profilesRes.error || rolesRes.error || userRolesRes.error) && (
          <p className="mt-3 text-red-600 text-sm">
            Erro a carregar dados:{" "}
            {[profilesRes.error?.message, rolesRes.error?.message, userRolesRes.error?.message].filter(Boolean).join(" | ")}
          </p>
        )}
      </section>
    </div>
  );
}
