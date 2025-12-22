import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashInviteCode } from "@/lib/inviteCode";

const normalizeUserId = (value: string) => value.trim().toLowerCase();

const isValidUserId = (value: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(value);

const toInitials = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 2);
};

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const userId = typeof body === "object" && body !== null ? (body as any).userId : null;
  const password = typeof body === "object" && body !== null ? (body as any).password : null;
  const name = typeof body === "object" && body !== null ? (body as any).name : null;
  const approvalCode =
    typeof body === "object" && body !== null ? (body as any).approvalCode : null;

  if (typeof userId !== "string" || typeof password !== "string" || typeof name !== "string") {
    return NextResponse.json({ message: "userId, password, name are required" }, { status: 400 });
  }
  if (typeof approvalCode !== "string") {
    return NextResponse.json({ message: "approvalCode is required" }, { status: 400 });
  }

  const normalizedUserId = normalizeUserId(userId);
  if (!isValidUserId(normalizedUserId)) {
    return NextResponse.json(
      { message: "Invalid userId format (3~30 chars, a-z0-9 . _ -)" },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return NextResponse.json({ message: "name is required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ message: "password must be at least 6 characters" }, { status: 400 });
  }

  let inviteHash: string | null = null;
  try {
    const codeHash = hashInviteCode(approvalCode);
    const { data, error } = await supabaseAdmin
      .from("signup_invite_codes")
      .select("id, active, expires_at, max_uses, uses_count")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    const now = Date.now();
    const expired =
      data?.expires_at ? new Date(data.expires_at as unknown as string).getTime() <= now : false;

    const exhausted =
      typeof data?.max_uses === "number" && data.max_uses > 0 ? data.uses_count >= data.max_uses : false;

    if (!data || !data.active || expired || exhausted) {
      return NextResponse.json({ message: "승인코드가 일치하지 않습니다." }, { status: 403 });
    }

    inviteHash = codeHash;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Invalid approval code configuration" },
      { status: 500 }
    );
  }

  const email = `${normalizedUserId}@we-et.com`;

  const { data: { users }, error: lookupError } = await supabaseAdmin.auth.admin.listUsers();

  if (lookupError) {
    return NextResponse.json({ message: lookupError.message }, { status: 500 });
  }

  const existing = users.find(u => u.email === email);
  if (existing) {
    return NextResponse.json({ message: "이미 사용 중인 아이디입니다." }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: trimmedName,
      userId: normalizedUserId,
    },
  });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 400 });
  }

  const user = data.user;
  if (user) {
    const { data: consumed, error: consumeError } = await supabaseAdmin.rpc(
      "consume_signup_invite_code",
      {
        code_hash_input: inviteHash as string,
        used_by_input: user.id,
      }
    );

    if (consumeError) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      return NextResponse.json({ message: consumeError.message }, { status: 500 });
    }

    if (!consumed) {
      await supabaseAdmin.auth.admin.deleteUser(user.id);
      return NextResponse.json(
        { message: "승인코드가 유효하지 않거나 사용 한도를 초과했습니다." },
        { status: 409 }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("app_users").upsert(
      {
        id: user.id,
        name: trimmedName,
        initials: toInitials(trimmedName),
        color: null,
      },
      { onConflict: "id" }
    );

    if (profileError) {
      return NextResponse.json({ message: profileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
