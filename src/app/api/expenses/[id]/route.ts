import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/expenses/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const nowIso = () => new Date().toISOString();

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const body: any = await request.json().catch(() => null);

  const patch: any = {};
  if (typeof body?.title === "string") patch.title = body.title.trim();
  if (typeof body?.amount !== "undefined") patch.amount = Number(body.amount);
  if (typeof body?.spent_at === "string") patch.spent_at = body.spent_at;
  if (typeof body?.category === "string") patch.category = body.category.trim() || null;
  if (typeof body?.note === "string") patch.note = body.note;

  const action = typeof body?.action === "string" ? body.action : null;
  if (action === "submit") {
    patch.status = "submitted";
  } else if (action === "approve") {
    patch.status = "approved";
    patch.approved_by = auth.userId;
    patch.approved_at = nowIso();
  } else if (action === "reject") {
    patch.status = "rejected";
    patch.rejected_by = auth.userId;
    patch.rejected_at = nowIso();
  } else if (action === "pay") {
    patch.status = "paid";
    patch.paid_by = auth.userId;
    patch.paid_at = nowIso();
  }

  patch.updated_at = nowIso();

  const { data, error } = await supabaseAdmin.from("expense_claims").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("expense_claims").delete().eq("id", id);
  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

