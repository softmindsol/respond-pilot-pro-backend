import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI = null;

// Standard helper for direct non-streaming calls
export async function llmClient({
    model = 'gemini-2.5-flash',
    prompt,
    temperature = 0.7,
    maxTokens = 800,
    responseMimeType = 'text/plain'
}) {
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set');
        }
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    try {
        const generativeModel = genAI.getGenerativeModel({
            model: model,
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
                responseMimeType
            }
        });

        const result = await generativeModel.generateContent(prompt);
        const response = await result.response;
        return response.text();

    } catch (err) {
        console.error("AI Error:", err);
        throw new Error('AI generation failed');
    }
}


export async function llmClientStream({
    model = 'gemini-2.5-flash',
    prompt,
    temperature = 0.7,
    maxTokens = 800,
    onChunk = () => { }
}) {
    // Initialize lazily or check if exists
    if (!genAI) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set in environment variables');
        }
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    try {
        // Fallback to gemini-2.5-flash if experimental model fails
        let targetModel = model;

        const generativeModel = genAI.getGenerativeModel({
            model: targetModel,
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            }
        });

        const result = await generativeModel.generateContentStream(prompt);

        for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
                onChunk(text);
            }
        }

        return { success: true };

    } catch (err) {
        let status = 500;
        let message = err?.message || 'Unknown AI error';
        console.error("AI Stream Error:", err);

        // Try to parse JSON error message if it exists
        try {
            const json = JSON.parse(message.match(/\{[\s\S]*\}/)?.[0]);
            status = json?.error?.code || status;
            message = json?.error?.message || message;
        } catch {
            // ignore parsing failure
        }

        throw {
            isGeminiError: true,
            status,
            message
        };
    }
}