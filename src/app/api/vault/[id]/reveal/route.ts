import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/vault/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptFromBase64 } from "@/lib/codeCipher";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("vault_entries")
    .select("password_ciphertext")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (!data?.password_ciphertext) return NextResponse.json({ message: "Not found" }, { status: 404 });

  try {
    const password = decryptFromBase64(data.password_ciphertext);
    return NextResponse.json({ password });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to decrypt password" },
      { status: 500 }
    );
  }
}

