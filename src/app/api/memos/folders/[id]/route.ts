import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

    // 1. Get the folder name before deleting
    const { data: folderData, error: fetchError } = await supabaseAdmin
        .from("memo_folders")
        .select("name")
        .eq("id", id)
        .eq("created_by", auth.userId)
        .single();

    if (fetchError || !folderData) {
        return NextResponse.json({ message: "Folder not found" }, { status: 404 });
    }

    // 2. Delete the folder record
    const { error } = await supabaseAdmin.from("memo_folders").delete().eq("id", id).eq("created_by", auth.userId);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    // 3. Update memos to remove this folder assignment (set to null)
    await supabaseAdmin
        .from("memos")
        .update({ folder: null })
        .eq("folder", folderData.name)
        .eq("created_by", auth.userId);

    return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

    const body: any = await request.json().catch(() => null);
    const newName = typeof body?.name === "string" ? body.name.trim() : "";
    if (!newName) return NextResponse.json({ message: "new name is required" }, { status: 400 });

    // 1. Get current folder name
    const { data: folderData, error: fetchError } = await supabaseAdmin
        .from("memo_folders")
        .select("name")
        .eq("id", id)
        .eq("created_by", auth.userId)
        .single();

    if (fetchError || !folderData) {
        return NextResponse.json({ message: "Folder not found" }, { status: 404 });
    }

    // 2. Update folder name
    const { error: updateError } = await supabaseAdmin
        .from("memo_folders")
        .update({ name: newName })
        .eq("id", id)
        .eq("created_by", auth.userId);

    if (updateError) {
        if (updateError.code === '23505') return NextResponse.json({ message: "이미 존재하는 폴더 이름입니다." }, { status: 400 });
        return NextResponse.json({ message: updateError.message }, { status: 400 });
    }

    // 3. Update memos to reflect new folder name
    await supabaseAdmin
        .from("memos")
        .update({ folder: newName })
        .eq("folder", folderData.name)
        .eq("created_by", auth.userId);

    return NextResponse.json({ ok: true });
}
