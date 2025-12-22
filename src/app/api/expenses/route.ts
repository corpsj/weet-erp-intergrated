import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/expenses/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("expense_claims")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const body: any = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const amount = typeof body?.amount === "number" ? body.amount : Number(body?.amount);
  const spentAt = typeof body?.spent_at === "string" ? body.spent_at : "";
  const category = typeof body?.category === "string" ? body.category.trim() : null;
  const note = typeof body?.note === "string" ? body.note : null;

  if (!title) return NextResponse.json({ message: "title is required" }, { status: 400 });
  if (!Number.isFinite(amount)) return NextResponse.json({ message: "amount is required" }, { status: 400 });
  if (!spentAt) return NextResponse.json({ message: "spent_at is required" }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("expense_claims")
    .insert({
      title,
      amount,
      spent_at: spentAt,
      category,
      note,
      status: "unpaid",
      created_by: auth.userId,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

