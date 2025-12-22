import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/expenses/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import crypto from "node:crypto";

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

  const contentTypeHeader = request.headers.get("content-type") ?? "";

  if (contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "file is required" }, { status: 400 });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const objectPath = `expenses/${id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from("receipts").upload(objectPath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ message: uploadError.message }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("expense_receipts")
      .insert({
        claim_id: id,
        object_path: objectPath,
        filename: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
  }

  return NextResponse.json({ message: "Unsupported content-type" }, { status: 415 });
}
