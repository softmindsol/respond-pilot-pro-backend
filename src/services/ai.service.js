import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const generateReply = async (commentText, tone = 'professional') => {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini", // Ya gpt-3.5-turbo (Sasta aur tez)
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