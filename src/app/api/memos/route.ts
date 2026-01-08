import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const showDeleted = searchParams.get("deleted") === "true";

  let query = supabaseAdmin
    .from("memos")
    .select("*, author:app_users(name)")
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });

  if (showDeleted) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}


export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const body: any = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : null;
  const memoBody = typeof body?.body === "string" ? body.body : "";
  const isPinned = !!body?.is_pinned;
  const folder = typeof body?.folder === "string" ? body.folder.trim() : null;

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("memos")
    .insert({
      title: title || null,
      body: memoBody,
      is_pinned: isPinned,
      folder: folder || null,
      created_by: auth.userId,
      updated_at: now
    })
    .select("*, author:app_users(name)")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

