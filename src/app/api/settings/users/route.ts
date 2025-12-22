import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUserId } from "../_auth";

export async function GET(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await supabaseAdmin
        .from("app_users")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data });
}

export async function DELETE(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");

    if (!userId) {
        return NextResponse.json({ message: "User ID is required" }, { status: 400 });
    }

    // Prevent self-deletion if necessary
    if (userId === auth.userId) {
        return NextResponse.json({ message: "Cannot delete yourself" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
        .from("app_users")
        .delete()
        .eq("id", userId);

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "User deleted" });
}
