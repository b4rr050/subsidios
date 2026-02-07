import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function createAdminClient() {
  if (!env.supabase.serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY em falta (necessário para operações admin).");
  }

  return createSupabaseClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
