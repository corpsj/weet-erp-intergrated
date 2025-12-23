import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    let query = supabaseAdmin.from("bank_transactions").select("*").order("transaction_date", { ascending: false });

    if (type) query = query.eq("type", type);
    if (start) query = query.gte("transaction_date", start);
    if (end) query = query.lte("transaction_date", end);

    const { data, error } = await query;

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ message: "Invalid body" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("bank_transactions")
        .insert(body)
        .select("*")
        .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ item: data }, { status: 201 });
}
