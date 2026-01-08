import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/memos/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await supabaseAdmin
        .from("memo_folders")
        .select("*")
        .eq("created_by", auth.userId)
        .order("name", { ascending: true });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const body: any = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ message: "folder name is required" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("memo_folders")
        .insert({ name, created_by: auth.userId })
        .select("*")
        .single();

    if (error) {
        if (error.code === '23505') return NextResponse.json({ message: "이미 존재하는 폴더 이름입니다." }, { status: 400 });
        return NextResponse.json({ message: error.message }, { status: 400 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
}
