import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { processUtilityBill } from "@/lib/utilityBillPipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = request.headers.get("x-cron-secret");
  const param = new URL(request.url).searchParams.get("cron_secret");
  return header === secret || param === secret;
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "3") || 3, 10);
  const targetId = searchParams.get("id");

  if (targetId) {
    await processUtilityBill(targetId);
    return NextResponse.json({ processed: 1 });
  }

  const { data, error } = await supabaseAdmin
    .from("utility_bills")
    .select("id")
    .eq("status", "PROCESSING")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });

  let processed = 0;
  for (const item of data ?? []) {
    await processUtilityBill(item.id);
    processed += 1;
  }

  return NextResponse.json({ processed });
}
