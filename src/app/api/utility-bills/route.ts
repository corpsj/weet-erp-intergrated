import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { data: items, error } = await supabaseAdmin
        .from("utility_bills")
        .select("*")
        .eq("company_id", auth.userId)
        .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
    if (!items || items.length === 0) return NextResponse.json({ items: [] });

    // Generate signed URLs for items that have an image_url (path)
    const itemsWithUrls = await Promise.all(items.map(async (item: any) => {
        if (!item.image_url) return item;

        // If it's already a full URL (though we aim for paths), keep it
        if (item.image_url.startsWith('http')) return item;

        const { data: signedData } = await supabaseAdmin.storage
            .from("receipts")
            .createSignedUrl(item.image_url, 3600); // 1 hour expiry

        return { ...item, image_url: signedData?.signedUrl || null };
    }));

    return NextResponse.json({ items: itemsWithUrls });
}

export async function POST(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const body: any = await request.json().catch(() => null);
    const category = body?.category || "";
    const billingMonth = body?.billing_month || "";
    const amount = Number(body?.amount || 0);
    // Prefer relative path if it's sent, or extract from full URL
    let imageUrl = body?.image_url || null;
    if (imageUrl && imageUrl.includes('/public/receipts/')) {
        imageUrl = imageUrl.split('/public/receipts/').pop();
    }

    const note = body?.note || "";
    const status = body?.status || "processed";

    if (!category || !billingMonth) {
        return NextResponse.json({ message: "category and billing_month are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from("utility_bills")
        .insert({
            company_id: auth.userId,
            category,
            billing_month: billingMonth,
            amount,
            image_url: imageUrl,
            note,
            status,
            is_paid: !!body?.is_paid,
            updated_at: new Date().toISOString()
        })
        .select("*")
        .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    // Generate a signed URL for the newly created item as well
    let signedUrl = data.image_url;
    if (data.image_url && !data.image_url.startsWith('http')) {
        const { data: signedData } = await supabaseAdmin.storage
            .from("receipts")
            .createSignedUrl(data.image_url, 3600);
        signedUrl = signedData?.signedUrl || null;
    }

    return NextResponse.json({ item: { ...data, image_url: signedUrl } }, { status: 201 });
}
