import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decryptFromBase64 } from "@/lib/codeCipher";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ message: "id is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("signup_invite_codes")
    .select("code_ciphertext")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
  if (!data?.code_ciphertext) {
    return NextResponse.json({ message: "초대코드를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const code = decryptFromBase64(data.code_ciphertext);
    return NextResponse.json({ code });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to decrypt code" },
      { status: 500 }
    );
  }
}

