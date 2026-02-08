import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // redireciona para login (client vai seguir)
  return NextResponse.json({ ok: true });
}
