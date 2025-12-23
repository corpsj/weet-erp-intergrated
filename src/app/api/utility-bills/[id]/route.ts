import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildUtilityBillPaths } from "@/lib/utilityBillPipeline";

export const runtime = "nodejs";

const signUrl = async (path: string | null) => {
  if (!path) return null;
  const { data, error } = await supabaseAdmin.storage.from("utility-bills").createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data?.signedUrl ?? null;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("utility_bills")
    .select("*")
    .eq("id", id)
    .eq("company_id", auth.userId)
    .single();

  if (error || !data) return NextResponse.json({ message: error?.message ?? "Not found" }, { status: 404 });

  const processedPaths = buildUtilityBillPaths(data.company_id, data.id);

  const originalUrl = await signUrl(data.file_url);
  const processedUrl = await signUrl(data.processed_file_url ?? processedPaths.scan);
  const trackAUrl = await signUrl(processedPaths.trackA);
  const trackBUrl = await signUrl(processedPaths.trackB);

  return NextResponse.json({
    item: {
      ...data,
      original_url: originalUrl,
      processed_url: processedUrl,
      trackA_url: trackAUrl,
      trackB_url: trackBUrl,
    },
  });
}
