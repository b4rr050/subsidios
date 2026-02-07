import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
  role: z.enum(["ADMIN", "TECH", "VALIDATOR", "PRESIDENT", "ENTITY"]),
  // ENTITY fields (required only if role === ENTITY)
  entity: z
    .object({
      name: z.string().min(2),
      nif: z.string().min(5),
    })
    .optional(),
});

export async function POST(req: Request) {
  // 1) Must be logged in as ADMIN (session user)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("has_role", { role: "ADMIN" });
  if (adminErr || isAdmin !== true) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2) Validate input
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { email, password, full_name, role, entity } = parsed.data;

  if (role === "ENTITY" && !entity) {
    return NextResponse.json({ error: "entity is required for role ENTITY" }, { status: 400 });
  }

  // 3) Create user in Supabase Auth via service role
  const supabaseAdmin = createAdminClient();

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "Failed to create user" }, { status: 500 });
  }

  const newUserId = created.user.id;

  // 4) If ENTITY role -> create entities row
  let entityId: string | null = null;

  if (role === "ENTITY") {
    const entRes = await supabaseAdmin
      .from("entities")
      .insert({
        name: entity!.name,
        nif: entity!.nif,
      })
      .select("id")
      .single();

    if (entRes.error) {
      // rollback: delete auth user to avoid orphan
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return NextResponse.json({ error: `Failed to create entity: ${entRes.error.message}` }, { status: 500 });
    }
    entityId = entRes.data.id;
  }

  // 5) Create profile
  const profRes = await supabaseAdmin
    .from("profiles")
    .insert({
      id: newUserId,
      full_name,
      email,
      entity_id: entityId,
      is_active: true,
    })
    .select("id")
    .single();

  if (profRes.error) {
    // rollback
    if (entityId) await supabaseAdmin.from("entities").update({ is_deleted: true }).eq("id", entityId);
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: `Failed to create profile: ${profRes.error.message}` }, { status: 500 });
  }

  // 6) Attach role
  const roleRow = await supabaseAdmin.from("roles").select("id").eq("code", role).single();
  if (roleRow.error) {
    if (entityId) await supabaseAdmin.from("entities").update({ is_deleted: true }).eq("id", entityId);
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: `Failed to find role: ${roleRow.error.message}` }, { status: 500 });
  }

  const urRes = await supabaseAdmin.from("user_roles").insert({
    user_id: newUserId,
    role_id: roleRow.data.id,
  });

  if (urRes.error) {
    if (entityId) await supabaseAdmin.from("entities").update({ is_deleted: true }).eq("id", entityId);
    await supabaseAdmin.auth.admin.deleteUser(newUserId);
    return NextResponse.json({ error: `Failed to assign role: ${urRes.error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, user_id: newUserId, entity_id: entityId });
}
