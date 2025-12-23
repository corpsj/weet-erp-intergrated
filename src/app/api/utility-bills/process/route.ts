import { NextResponse } from "next/server";
import { requireUserId } from "@/app/api/settings/_auth";
import { callOpenRouter } from "@/lib/openrouter";

export async function POST(request: Request) {
    const auth = await requireUserId(request);
    if (!auth.ok) return auth.response;

    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        if (!file) {
            return NextResponse.json({ message: "No file provided" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const base64 = Buffer.from(bytes).toString("base64");
        const mimeType = file.type || "image/jpeg";

        const prompt = `Analyze this utility bill image and extract information in JSON format.
Possible categories: "전기세", "건강보험", "세금" (Choose the most appropriate one).
Required fields:
{
  "category": "전기세" | "건강보험" | "세금",
  "billing_month": "YYYY-MM",
  "amount": number
}
Response must be valid JSON only.`;

        const messages = [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${mimeType};base64,${base64}`
                        }
                    }
                ]
            }
        ];

        // Using google/gemini-2.5-flash as requested by user
        const aiResponse = await callOpenRouter(messages, "google/gemini-2.5-flash");

        let content = aiResponse.choices[0].message.content;
        // Remove markdown code blocks if any
        content = content.replace(/```json\n?|```/g, "").trim();
        const result = JSON.parse(content);

        return NextResponse.json({ result });
    } catch (error: any) {
        console.error("AI Processing Error:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}
