export async function callOpenRouter(messages: any[], model: string = "google/gemini-2.5-flash") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        throw new Error("OPENROUTER_API_KEY is not set");
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://weet-erp.vercel.app",
            "X-Title": "WE-ET ERP",
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            response_format: { type: "json_object" }
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter Error:", errorText);
        throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
    }

    return await response.json();
}
