import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireUserId } from "../_auth";

export async function GET(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { data, error } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "ai_model")
        .single();

    if (error && error.code !== "PGRST116") {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ model: data?.value || "google/gemini-2.5-flash" });
}

export async function POST(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const body = await request.json().catch(() => ({}));
    const model = body.model;

    if (!model) {
        return NextResponse.json({ message: "model is required" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from("app_settings")
        .upsert({ key: "ai_model", value: model, updated_at: new Date().toISOString() });

    if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Setting saved" });
}
