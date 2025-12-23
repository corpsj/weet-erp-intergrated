import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const body: any = await request.json().catch(() => null);
    const { id } = await params;

    // Sanitize image_url: extract path from full URL if needed
    let imageUrl = body?.image_url;
    if (imageUrl && imageUrl.includes('/public/receipts/')) {
        imageUrl = imageUrl.split('/public/receipts/').pop();
    }

    const { data, error } = await supabaseAdmin
        .from("utility_bills")
        .update({
            category: body?.category,
            billing_month: body?.billing_month,
            amount: Number(body?.amount || 0),
            image_url: imageUrl,
            note: body?.note,
            status: body?.status || "manual",
            is_paid: body?.is_paid !== undefined ? !!body.is_paid : undefined,
            updated_at: new Date().toISOString()
        })
        .eq("id", id)
        .eq("company_id", auth.userId)
        .select("*")
        .single();

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });

    // Generate a signed URL for the response
    let finalImageUrl = data.image_url;
    if (data.image_url && !data.image_url.startsWith('http')) {
        const { data: signedData } = await supabaseAdmin.storage
            .from("receipts")
            .createSignedUrl(data.image_url, 3600);
        finalImageUrl = signedData?.signedUrl || null;
    }

    return NextResponse.json({ item: { ...data, image_url: finalImageUrl } });
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    const { id } = await params;

    // UUID format check to prevent "invalid input syntax for type uuid" error
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        return NextResponse.json({ message: "유효하지 않은 ID 형식입니다." }, { status: 400 });
    }

    const { error, count } = await supabaseAdmin
        .from("utility_bills")
        .delete({ count: "exact" })
        .eq("id", id)
        .eq("company_id", auth.userId);

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    if (count === 0) return NextResponse.json({ message: "삭제할 데이터를 찾지 못했거나 권한이 없습니다." }, { status: 404 });

    return NextResponse.json({ success: true });
}
