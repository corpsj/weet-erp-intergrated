import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin.from("memos").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const body: any = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : null;
  const memoBody = typeof body?.body === "string" ? body.body : "";

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("memos")
    .insert({ title: title || null, body: memoBody, created_by: auth.userId, updated_at: now })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

