import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type InsertApp = {
  entity_id: string;
  category_id: string;
  object_title: string;
  object_normalized: string;
  requested_amount: number | null;
  current_status: string;
  origin: string;
  is_deleted?: boolean;
};

function normalizeTitle(input: string) {
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

  return s.length ? s : `pedido-${Date.now()}`;
}

async function isEntityUser() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_role", { role: "ENTITY" });
  return data === true;
}

export default async function EntityNewApplicationPage() {
  if (!(await isEntityUser())) redirect("/unauthorized");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", user.id)
    .single();

  if (profErr) redirect(`/entity?err=${encodeURIComponent(profErr.message)}`);

  const entityId = profile?.entity_id;
  if (!entityId) redirect("/unauthorized");

  // ✅ category_id é NOT NULL na tua BD -> escolher uma categoria ativa por defeito
  const { data: defaultCat, error: catErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name")
    .limit(1)
    .maybeSingle();

  if (catErr) redirect(`/entity?err=${encodeURIComponent(catErr.message)}`);
  if (!defaultCat?.id) redirect(`/entity?err=${encodeURIComponent("Não existem categorias ativas. Cria uma categoria antes de criar pedidos.")}`);

  const object_title = "Novo pedido";

  const payload: InsertApp = {
    entity_id: entityId,
    category_id: defaultCat.id,
    object_title,
    object_normalized: normalizeTitle(object_title),
    requested_amount: null,
    current_status: "S1_DRAFT",
    origin: "SPONTANEOUS",
    is_deleted: false,
  };

  const { data: created, error: insErr } = await supabase.from("applications").insert(payload).select("id").single();

  if (insErr || !created?.id) {
    const msg = insErr?.message ?? "create_failed";
    redirect(`/entity?err=${encodeURIComponent(msg)}`);
  }

  redirect(`/entity/applications/${created.id}`);
}
