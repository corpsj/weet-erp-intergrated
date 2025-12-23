import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BILL_TYPES = ["ELECTRICITY", "WATER", "GAS", "TELECOM", "TAX", "ETC"];

const parseAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
};

const parseDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });

  const body = await request.json().catch(() => null);

  const patch: Record<string, unknown> = {
    status: "CONFIRMED",
    updated_at: new Date().toISOString(),
  };

  if (body) {
    const vendorName = typeof body.vendor_name === "string" ? body.vendor_name.trim() : "";
    const billType = typeof body.bill_type === "string" ? body.bill_type.trim() : "";
    const amountDue = parseAmount(body.amount_due);
    const dueDate = parseDate(body.due_date);
    const billingStart = parseDate(body.billing_period_start);
    const billingEnd = parseDate(body.billing_period_end);
    const customerNo = typeof body.customer_no === "string" ? body.customer_no.trim() : "";
    const paymentAccount = typeof body.payment_account === "string" ? body.payment_account.trim() : "";

    if (vendorName) patch.vendor_name = vendorName;
    if (billType && BILL_TYPES.includes(billType)) patch.bill_type = billType;
    if (amountDue !== null) patch.amount_due = amountDue;
    if (dueDate) patch.due_date = dueDate;
    if (billingStart) patch.billing_period_start = billingStart;
    if (billingEnd) patch.billing_period_end = billingEnd;
    if (customerNo) patch.customer_no = customerNo;
    if (paymentAccount) patch.payment_account = paymentAccount;
  }

  const { data, error } = await supabaseAdmin
    .from("utility_bills")
    .update(patch)
    .eq("id", id)
    .eq("company_id", auth.userId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}
