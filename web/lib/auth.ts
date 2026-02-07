import { createClient } from "@/lib/supabase/server";

export type RoleCode = "ADMIN" | "TECH" | "VALIDATOR" | "PRESIDENT" | "ENTITY";

export async function getAuthedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, supabase };
  return { user: data.user, supabase };
}

export async function hasRole(role: RoleCode) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_role", { role });
  if (error) return false;
  return data === true;
}

export async function requireRole(role: RoleCode) {
  const { user } = await getAuthedUser();
  if (!user) return false;
  return await hasRole(role);
}

/**
 * Resolve "rota inicial" após login.
 * Ordem:
 * - ADMIN -> /admin
 * - PRESIDENT -> /president (futuro) ou /admin (por agora)
 * - TECH/VALIDATOR -> /backoffice (futuro) ou /admin
 * - ENTITY -> /entity (futuro)
 */
export async function resolveHomePath() {
  const supabase = await createClient();

  const checks: Array<{ role: RoleCode; path: string }> = [
    { role: "ADMIN", path: "/admin" },
    { role: "PRESIDENT", path: "/admin" },
    { role: "VALIDATOR", path: "/admin" },
    { role: "TECH", path: "/admin" },
    { role: "ENTITY", path: "/entity" },
  ];

  for (const c of checks) {
    const { data } = await supabase.rpc("has_role", { role: c.role });
    if (data === true) return c.path;
  }

  return "/unauthorized";
}
