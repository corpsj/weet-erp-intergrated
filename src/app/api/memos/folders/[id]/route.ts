import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

    // Optional: We could set memos in this folder to null, or leave as is. 
    // Given current string-based folder column in memos, deleting the folder 
    // record doesn't strictly break memos, but it removes it from the sidebar list.

    const { error } = await supabaseAdmin.from("memo_folders").delete().eq("id", id).eq("created_by", auth.userId);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
}
