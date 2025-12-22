import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const normalizeUserId = (value: string) => value.trim().toLowerCase();

const isValidUserId = (value: string) => /^[a-z0-9][a-z0-9._-]{2,29}$/.test(value);

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const userId = typeof body === "object" && body !== null ? (body as any).userId : null;
  if (typeof userId !== "string") {
    return NextResponse.json({ message: "userId is required" }, { status: 400 });
  }

  const normalized = normalizeUserId(userId);
  if (!isValidUserId(normalized)) {
    return NextResponse.json(
      { message: "Invalid userId format (3~30 chars, a-z0-9 . _ -)" },
      { status: 400 }
    );
  }

  const email = `${normalized}@we-et.com`;

  const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const existing = users.find(u => u.email === email);

  return NextResponse.json({ available: !existing });
}

