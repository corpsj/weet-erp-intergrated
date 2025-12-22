import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ message: "Invalid body" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("bank_transactions")
        .update({ ...body, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const { error } = await supabaseAdmin.from("bank_transactions").delete().eq("id", id);

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
}
