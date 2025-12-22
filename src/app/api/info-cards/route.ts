import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/info-cards/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await supabaseAdmin
    .from("company_info_cards")
    .select("*")
    .order("pinned", { ascending: false })
    .order("sort_index", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const body: any = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const cardBody = typeof body?.body === "string" ? body.body : "";
  const pinned = typeof body?.pinned === "boolean" ? body.pinned : false;
  const sortIndex = typeof body?.sort_index === "number" ? body.sort_index : null;

  if (!title) return NextResponse.json({ message: "title is required" }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("company_info_cards")
    .insert({ title, body: cardBody, pinned, sort_index: sortIndex, updated_at: now })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data }, { status: 201 });
}

