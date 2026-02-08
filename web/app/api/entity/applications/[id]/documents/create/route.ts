import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  document_type_id: z.string().uuid(),
  file_path: z.string().min(1),
  original_name: z.string().min(1),
  mime_type: z.string().nullable().optional(),
  size_bytes: z.number().int().nullable().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await ctx.params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });

  const role = await supabase.rpc("has_role", { role: "ENTITY" });
  if (role.data !== true) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });

  // Qual é a entidade deste utilizador?
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("entity_id")
    .eq("id", user.id)
    .single();

  if (profErr || !profile?.entity_id) {
    return NextResponse.json({ ok: false, error: "Missing entity profile" }, { status: 400 });
  }

  const entityId = profile.entity_id;

  // Garantir que o pedido pertence à entidade e está numa fase onde aceita docs
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id, entity_id, current_status, is_deleted")
    .eq("id", applicationId)
    .single();

  if (appErr || !app || app.is_deleted) {
    return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
  }

  if (app.entity_id !== entityId) {
    return NextResponse.json({ ok: false, error: "Forbidden (wrong entity)" }, { status: 403 });
  }

  const can = await supabase.rpc("can_upload_application_docs", { app_id: applicationId });
  if (can.data !== true) {
    return NextResponse.json({ ok: false, error: "Upload fechado: pedido não está numa fase aberta." }, { status: 409 });
  }

  // Inserir registo em documents
  const ins = await supabase.from("documents").insert({
    scope: "APPLICATION",
    entity_id: entityId,
    application_id: applicationId,
    document_type_id: parsed.data.document_type_id,
    file_path: parsed.data.file_path,
    original_name: parsed.data.original_name,
    mime_type: parsed.data.mime_type ?? null,
    size_bytes: parsed.data.size_bytes ?? null,
    status: "PENDING",
    uploaded_by: user.id,
  });

  if (ins.error) {
    return NextResponse.json({ ok: false, error: ins.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
