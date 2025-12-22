import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("memo_attachments")
    .select("object_path")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (!data?.object_path) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from("attachments")
    .createSignedUrl(data.object_path, 60 * 10);

  if (signError) return NextResponse.json({ message: signError.message }, { status: 400 });
  return NextResponse.json({ url: signed?.signedUrl });
}

