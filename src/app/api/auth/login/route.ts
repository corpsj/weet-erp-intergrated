import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const userId =
    typeof body === "object" && body !== null ? (body as any).userId : null;

  if (typeof userId !== "string" || !userId.trim()) {
    return NextResponse.json(
      { message: "아이디를 입력하세요." },
      { status: 400 },
    );
  }

  const email = `${userId.trim().toLowerCase()}@we-et.com`;

  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (linkError) {
    return NextResponse.json(
      { message: "존재하지 않는 아이디이거나 로그인 처리 중 오류가 발생했습니다." },
      { status: 400 },
    );
  }

  const serverClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: otpData, error: otpError } = await serverClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });

  if (otpError || !otpData.session) {
    return NextResponse.json(
      { message: otpError?.message ?? "세션 생성에 실패했습니다." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    access_token: otpData.session.access_token,
    refresh_token: otpData.session.refresh_token,
  });
}
