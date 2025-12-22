import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/vault/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToBase64 } from "@/lib/codeCipher";

const normalizeTags = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const body: any = await request.json().catch(() => null);

  const patch: any = {};
  if (typeof body?.title === "string") patch.title = body.title.trim();
  if (typeof body?.url === "string") patch.url = body.url.trim() || null;
  if (typeof body?.username === "string") patch.username = body.username.trim() || null;
  if (typeof body?.note === "string") patch.note = body.note;
  if (typeof body?.tags !== "undefined") patch.tags = normalizeTags(body.tags);

  if (typeof body?.password === "string" && body.password) {
    try {
      patch.password_ciphertext = encryptToBase64(body.password);
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "Encryption not configured" },
        { status: 500 }
      );
    }
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("vault_entries")
    .update(patch)
    .eq("id", id)
    .select("id, title, url, username, note, tags, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("vault_entries").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

