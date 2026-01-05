import { GoogleGenerativeAI } from "@google/generative-ai";
import config from '../config/index.js';

const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const generateReply = async (commentText, systemInstruction) => {
    try {
        // 🔥 UPDATE: Prompt Engineering for Context
        const prompt = `
        You are a YouTube Creator's assistant. 
        
        ${systemInstruction}

        --- INPUT COMMENT / CONTEXT ---
        ${commentText}
        -------------------------------

        **Instructions:**
        1. If the input contains [CONTEXT START], analyze the thread.
        2. Reply ONLY to the last person mentioned in the context.
        3. Keep the reply relevant to the Main Comment's topic.
        4. Do NOT start with "Here is a reply" or quotes. Just write the reply.
        5. Keep it under 280 characters.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini Error:', error);
        throw new Error('Failed to generate AI reply');
    }
};

export default { generateReply };