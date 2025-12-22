import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function requireUserId(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
        return { ok: false, response: NextResponse.json({ message: "No auth header" }, { status: 401 }) };
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return { ok: false, response: NextResponse.json({ message: "Invalid session" }, { status: 401 }) };
    }

    return { ok: true, userId: user.id };
}
