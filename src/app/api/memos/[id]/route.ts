import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const body: any = await request.json().catch(() => null);
  const patch: any = {};
  if (typeof body?.title === "string") patch.title = body.title.trim() || null;
  if (typeof body?.body === "string") patch.body = body.body;
  if (body?.is_pinned !== undefined) patch.is_pinned = !!body.is_pinned;
  if (typeof body?.folder === "string") patch.folder = body.folder.trim() || null;
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from("memos").update(patch).eq("id", id).select("*, author:app_users(name)").single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const permanent = searchParams.get("permanent") === "true";

  if (permanent) {
    const { error } = await supabaseAdmin.from("memos").delete().eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  } else {
    const { error } = await supabaseAdmin
      .from("memos")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

