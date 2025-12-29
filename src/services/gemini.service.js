import OpenAI from 'openai';
import { GoogleGenerativeAI } from "@google/generative-ai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// For simple reply generation (non-streaming) used in YouTube Controller
const generateReply = async (commentText, tone = 'professional') => {
    // Fallback to Gemini if OpenAI fails or vice versa
    if (process.env.GEMINI_API_KEY) {
        try {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const prompt = `You are a helpful YouTube creator assistant. 
                    Your goal is to reply to user comments. 
                    Tone: ${tone}. 
                    Keep the reply concise, engaging, and under 280 characters.
                    
                    Here is the viewer's comment: "${commentText}". Write a reply.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error('Gemini Error in generateReply:', error);
            // Fallthrough or throw
        }
    }

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a helpful YouTube creator assistant. 
                    Your goal is to reply to user comments. 
                    Tone: ${tone}. 
                    Keep the reply concise, engaging, and under 280 characters.`
                },
                {
                    role: "user",
                    content: `Here is the viewer's comment: "${commentText}". Write a reply.`
                }
            ],
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error('OpenAI Error:', error);
        throw new Error('Failed to generate AI reply');
    }
};

export default {
    generateReply
};
