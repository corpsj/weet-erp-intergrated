import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { triggerUtilityBillProcessing } from "@/lib/utilityBillPipeline";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("utility_bills")
    .update({
      status: "PROCESSING",
      processing_stage: "PREPROCESS",
      last_error_code: null,
      last_error_message: null,
      confidence: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", auth.userId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  triggerUtilityBillProcessing(id);

  return NextResponse.json({ item: data });
}
