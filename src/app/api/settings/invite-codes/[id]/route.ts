import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const toIso = (value: Date) => value.toISOString();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  const active = typeof body === "object" && body !== null ? (body as any).active : undefined;
  const note = typeof body === "object" && body !== null ? (body as any).note : undefined;
  const expiresInDays =
    typeof body === "object" && body !== null ? (body as any).expiresInDays : undefined;
  const maxUses = typeof body === "object" && body !== null ? (body as any).maxUses : undefined;

  const patch: Record<string, unknown> = {};
  if (typeof active === "boolean") patch.active = active;
  if (typeof note === "string") patch.note = note;

  if (typeof expiresInDays === "number" && Number.isFinite(expiresInDays)) {
    patch.expires_at =
      expiresInDays > 0 ? toIso(new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)) : null;
  }

  if (typeof maxUses === "number" && Number.isFinite(maxUses)) {
    patch.max_uses = maxUses > 0 ? Math.floor(maxUses) : null;
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ message: "No changes" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("signup_invite_codes")
    .update(patch)
    .eq("id", id)
    .select("id, active, note, expires_at, max_uses, uses_count, last_used_at, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data });
}

