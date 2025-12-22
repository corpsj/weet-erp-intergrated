import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashInviteCode } from "@/lib/inviteCode";
import { encryptToBase64 } from "@/lib/codeCipher";
import crypto from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const generateCode = () => {
  const bytes = crypto.randomBytes(6);
  let result = "";
  for (let i = 0; i < 6; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
};

const toIso = (value: Date) => value.toISOString();

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("signup_invite_codes")
    .select("id, active, note, expires_at, max_uses, uses_count, last_used_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const body: unknown = await request.json().catch(() => null);
  const note = typeof body === "object" && body !== null ? (body as any).note : null;
  const expiresInDays =
    typeof body === "object" && body !== null ? (body as any).expiresInDays : null;
  const maxUses = typeof body === "object" && body !== null ? (body as any).maxUses : null;
  const codeInput = typeof body === "object" && body !== null ? (body as any).code : null;

  const days =
    typeof expiresInDays === "number" && Number.isFinite(expiresInDays) ? expiresInDays : 3;
  const expiresAt = days > 0 ? toIso(new Date(Date.now() + days * 24 * 60 * 60 * 1000)) : null;

  const normalizedMaxUses =
    maxUses === null || typeof maxUses === "undefined"
      ? 1
      : typeof maxUses === "number" && Number.isFinite(maxUses) && maxUses > 0
        ? Math.floor(maxUses)
        : maxUses === 0
          ? null
          : null;

  const code =
    typeof codeInput === "string" && codeInput.trim()
      ? codeInput.trim().toUpperCase()
      : generateCode();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ message: "코드는 6자리 영문/숫자여야 합니다." }, { status: 400 });
  }

  const codeHash = hashInviteCode(code);
  const codeCiphertext = encryptToBase64(code);

  const { data, error } = await supabaseAdmin
    .from("signup_invite_codes")
    .insert({
      code_hash: codeHash,
      code_ciphertext: codeCiphertext,
      active: true,
      note: typeof note === "string" ? note : null,
      expires_at: expiresAt,
      max_uses: normalizedMaxUses,
    })
    .select("id, active, note, expires_at, max_uses, uses_count, created_at")
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ item: data, code }, { status: 201 });
}
