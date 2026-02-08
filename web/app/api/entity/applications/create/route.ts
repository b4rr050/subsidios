import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeText } from "@/lib/text";

const BodySchema = z.object({
  category_id: z.string().uuid(),
  object_title: z.string().min(3),
  requested_amount: z.coerce.number().min(0),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const { data: isEntity } = await supabase.rpc("has_role", { role: "ENTITY" });
  if (isEntity !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", userData.user.id)
    .single();

  if (profErr || !profile?.entity_id) {
    return NextResponse.json({ ok: false, error: "No entity linked to user" }, { status: 400 });
  }

  const entityId = profile.entity_id;
  const { category_id, object_title, requested_amount } = parsed.data;

  const object_normalized = normalizeText(object_title);

  // Warning: procurar possíveis duplicados (não bloqueia, só devolve lista)
  const dupRes = await supabase
    .from("applications")
    .select("id, object_title, created_at, current_status")
    .eq("entity_id", entityId)
    .eq("is_deleted", false)
    .ilike("object_normalized", `%${object_normalized}%`)
    .limit(5);

  const insertRes = await supabase
    .from("applications")
    .insert({
      origin: "SPONTANEOUS",
      program_id: null,
      entity_id: entityId,
      category_id,
      object_title,
      object_normalized,
      requested_amount,
      current_status: "S1_DRAFT",
      created_by: userData.user.id,
    })
    .select("id")
    .single();

  if (insertRes.error) {
    return NextResponse.json({ ok: false, error: insertRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: insertRes.data.id,
    possibleDuplicates: dupRes.data ?? [],
  });
}
