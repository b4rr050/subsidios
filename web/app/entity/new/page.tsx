import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type InsertApp = {
  entity_id: string;
  category_id: string | null;
  object_title: string;
  object_normalized: string;
  requested_amount: number | null;
  current_status: string;
  origin: string;
  is_deleted?: boolean;
};

function normalizeTitle(input: string) {
  // normalização simples e estável para preencher object_normalized (NOT NULL)
  // - lower
  // - remove acentos
  // - troca espaços por hífen
  // - remove caracteres inválidos
  const s = (input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "-")
    .replace(/-+/g, "-");

  // fallback para nunca ficar vazio
  return s.length ? s : `pedido-${Date.now()}`;
}

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityNewApplicationPage() {
  // Permissões
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  // Sessão
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Entity do utilizador
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", user.id)
    .single();

  if (profErr) redirect(`/entity?err=${encodeURIComponent(profErr.message)}`);

  const entityId = profile?.entity_id;
  if (!entityId) redirect("/unauthorized");

  // Criar rascunho
  const object_title = "Novo pedido";
  const payload: InsertApp = {
    entity_id: entityId,
    category_id: null,
    object_title,
    object_normalized: normalizeTitle(object_title),
    requested_amount: null,
    current_status: "S1_DRAFT",
    origin: "SPONTANEOUS",
    is_deleted: false,
  };

  const { data: created, error: insErr } = await supabase
    .from("applications")
    .insert(payload)
    .select("id")
    .single();

  if (insErr || !created?.id) {
    const msg = insErr?.message ?? "create_failed";
    redirect(`/entity?err=${encodeURIComponent(msg)}`);
  }

  // Ir para o detalhe
  redirect(`/entity/applications/${created.id}`);
}
