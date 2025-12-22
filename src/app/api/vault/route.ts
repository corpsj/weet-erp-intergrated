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

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("vault_entries")
    .select("id, title, url, username, note, tags, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const body: any = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const url = typeof body?.url === "string" ? body.url.trim() : null;
  const username = typeof body?.username === "string" ? body.username.trim() : null;
  const password = typeof body?.password === "string" ? body.password : "";
  const note = typeof body?.note === "string" ? body.note : null;
  const tags = normalizeTags(body?.tags);

  if (!title) return NextResponse.json({ message: "title is required" }, { status: 400 });
  if (!password) return NextResponse.json({ message: "password is required" }, { status: 400 });

  let passwordCiphertext: string;
  try {
    passwordCiphertext = encryptToBase64(password);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Encryption not configured" },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("vault_entries")
    .insert({
      title,
      url,
      username,
      password_ciphertext: passwordCiphertext,
      note,
      tags,
      updated_at: now,
    })
    .select("id, title, url, username, note, tags, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

