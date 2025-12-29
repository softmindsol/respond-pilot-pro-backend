import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });
console.log("process.env.GEMINI_API_KEY:", process.env.GEMINI_API_KEY)
const generateReply = async (commentText, tone = 'professional') => {
    try {
        const prompt = `You are a helpful YouTube creator assistant. 
        Your goal is to reply to user comments. 
        Tone: ${tone}. 
        Keep the reply concise, engaging, and under 280 characters.
        
        Here is the viewer's comment: "${commentText}". Write a reply.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error('Gemini Error:', error);
        throw new Error('Failed to generate AI reply with Gemini');
    }
};

export default {
    generateReply
};
