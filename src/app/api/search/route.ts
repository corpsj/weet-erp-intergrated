import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/search/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const normalizeQuery = (value: string) => value.trim().slice(0, 200);

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const q = normalizeQuery(url.searchParams.get("q") ?? "");
  if (!q) return NextResponse.json({ q: "", results: { info: [], memos: [], todos: [] } });

  const pattern = `%${q}%`;

  const [info, memos, todos] = await Promise.all([
    supabaseAdmin
      .from("company_info_cards")
      .select("id, title, body, pinned, updated_at")
      .or(`title.ilike.${pattern},body.ilike.${pattern}`)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("memos")
      .select("id, title, body, created_at")
      .or(`title.ilike.${pattern},body.ilike.${pattern}`)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("todos")
      .select("id, title, status, priority, created_at")
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (info.error) return NextResponse.json({ message: info.error.message }, { status: 500 });
  if (memos.error) return NextResponse.json({ message: memos.error.message }, { status: 500 });
  if (todos.error) return NextResponse.json({ message: todos.error.message }, { status: 500 });

  return NextResponse.json({
    q,
    results: {
      info: info.data ?? [],
      memos: memos.data ?? [],
      todos: todos.data ?? [],
    },
  });
}

