import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/expenses/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("expense_receipts")
    .select("*")
    .eq("claim_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const body: any = await request.json().catch(() => null);
  const objectPath = typeof body?.object_path === "string" ? body.object_path : null;
  const filename = typeof body?.filename === "string" ? body.filename : null;
  const contentType = typeof body?.content_type === "string" ? body.content_type : null;
  const sizeBytes = typeof body?.size_bytes === "number" ? body.size_bytes : null;

  if (!objectPath) return NextResponse.json({ message: "object_path is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("expense_receipts")
    .insert({
      claim_id: id,
      object_path: objectPath,
      filename,
      content_type: contentType,
      size_bytes: sizeBytes,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

