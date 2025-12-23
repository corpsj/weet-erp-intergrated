import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { triggerUtilityBillProcessing } from "@/lib/utilityBillPipeline";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseMonthRange = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{4})-(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const endDate = new Date(year, month, 0);
  const endDay = String(endDate.getDate()).padStart(2, "0");
  const end = `${year}-${mm}-${endDay}`;
  return { start, end };
};

export async function GET(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "";
  const month = searchParams.get("month") ?? "";
  const siteId = searchParams.get("site_id") ?? "";

  let query = supabaseAdmin
    .from("utility_bills")
    .select("*")
    .eq("company_id", auth.userId)
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (siteId) query = query.eq("site_id", siteId);

  const range = month ? parseMonthRange(month) : null;
  if (range) {
    query = query.gte("due_date", range.start).lte("due_date", range.end);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const contentTypeHeader = request.headers.get("content-type") ?? "";
  if (!contentTypeHeader.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ message: "Unsupported content-type" }, { status: 415 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "file is required" }, { status: 400 });
  }

  const siteIdValue = form.get("site_id");
  const siteId = typeof siteIdValue === "string" && siteIdValue.trim() ? siteIdValue.trim() : null;
  if (siteId && !isUuid(siteId)) {
    return NextResponse.json({ message: "site_id is invalid" }, { status: 400 });
  }

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "png";
  const safeName = file.name ? file.name.replace(/[^\w.-]+/g, "_") : `upload.${ext}`;
  const billId = crypto.randomUUID();
  const objectPath = `${auth.userId}/${billId}/original/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage.from("utility-bills").upload(objectPath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ message: uploadError.message }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("utility_bills")
    .insert({
      id: billId,
      company_id: auth.userId,
      site_id: siteId,
      status: "PROCESSING",
      processing_stage: "PREPROCESS",
      file_url: objectPath,
      processed_file_url: null,
      confidence: 0,
      extracted_json: {},
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });

  triggerUtilityBillProcessing(billId);

  return NextResponse.json({ item: data }, { status: 201 });
}
