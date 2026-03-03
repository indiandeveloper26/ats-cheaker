
import { NextResponse } from "next/server";
import pdf from "pdf-parse";
import { ChatGroq } from "@langchain/groq";

export const runtime = "nodejs"; // ✅ Vercel ke liye important

// ✅ Lazy LLM init (serverless safe)
function getLLM() {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("Missing GROQ_API_KEY in environment variables");
    }
    // getLLM function ke andar model select karte waqt:
    return new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: "llama-3.1-8b-instant",
        temperature: 0,
        modelKwargs: { "response_format": { "type": "json_object" } } // ✅ AI sirf JSON hi dega
    });
}

export async function POST(req) {
    try {
        const data = await req.formData();
        const file = data.get("resume");
        const userJD = data.get("jobDescription");

        // ✅ Validation
        if (!file || !userJD || userJD.trim().length < 10) {
            return NextResponse.json(
                { success: false, error: "Resume and valid JD are required." },
                { status: 400 }
            );
        }

        // ✅ Blob → Buffer (DEV + VERCEL SAFE)
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // ✅ PDF parse (MOST IMPORTANT FIX)
        const pdfData = await pdf(buffer);
        const resumeText = pdfData.text;

        if (!resumeText || resumeText.trim().length < 20) {
            return NextResponse.json(
                { success: false, error: "Could not read PDF content." },
                { status: 422 }
            );
        }

        // ✅ ATS Prompt
        const atsPrompt = `
You are a highly critical ATS Scanner.

STRICT RULES:
1. Use ONLY the provided Job Description.
2. matchPercentage must be 0% if unrelated.
3. Be very strict with scoring.
4. Respond ONLY with valid JSON.

JOB DESCRIPTION:
${userJD}

RESUME CONTENT:
${resumeText}

Return ONLY a JSON object:
{
  "matchPercentage": number,
  "missingKeywords": ["string"],
  "profileSummary": "string",
  "improvements": ["string"]
}
`;

        const llm = getLLM();
        const response = await llm.invoke(atsPrompt);

        // ✅ Safe JSON cleanup
        const cleaned = response.content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let analysis;

        try {
            analysis = JSON.parse(cleaned);
        } catch (e) {
            console.error("❌ JSON parse failed:", cleaned);
            throw new Error("Invalid AI response formatt");
        }

        return NextResponse.json({
            success: true,
            analysis,
        });
    } catch (error) {
        console.error("❌ ATS API Error:", error);

        return NextResponse.json(
            {
                success: false,
                error: error.message || "Internal Server Error",
            },
            { status: 500 }
        );
    }
}




