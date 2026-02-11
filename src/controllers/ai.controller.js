import { llmClient } from '../utils/llmClientStream.js';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js'; 
import { PERSONAS } from '../config/personas.js';

// --- 🔥 NEW: HOOK DIVERSITY STRATEGIES ---
const HOOK_STRATEGIES = [
    "Direct: Jump straight into the answer or point without any greeting.",
    "Observation: Start with a specific detail about what the user mentioned.",
    "Questioning: Start by asking the user a thought-provoking follow-up question.",
    "Hype: Start with high-energy reactions like 'Love this!' or 'Facts!'.",
    "Casual: Start with 'Exactly,' or 'Total agreement on this,'",
    "Curious: Start with 'That's an interesting perspective,'",
    "Mentor: Start with 'Great catch, here is why that happens:'",
    "Friendly: Use the author's name immediately like 'Hey @[Name],'",
    "Reactionary: Use just a single punchy emoji as the opening.",
    "Analytical: Start with 'To address your point about...'",
    "Excited: Start with 'This is exactly what I was hoping someone would notice!'",
    "Brief: Keep it under 15 words total.",
    "Opinionated: Start with 'Personally, I feel...'",
    "Action-Oriented: Start with 'On it!' or 'Adding this to my notes!'",
    "Minimalist: No greetings, no fluff, just the core value."
];

// Utils 
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const STATUS_CODES = {
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    INTERNAL_SERVER_ERROR: 500
};

const handleError = (next, message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    next(error);
};

const isGibberish = (text) => {
    if (!text || typeof text !== 'string') return true;
    return text.trim().length < 1;
};

// --- Plan & Tone Constants ---
const PLANS = {
    FREE: 'Free',
    BASIC: 'Basic',
    PRO: 'Pro',
    PRO_PLUS: 'PRO_PLUS'
};

const TONE_TYPES = {
    FRIENDLY: 'friendly',
    PROFESSIONAL: 'professional',
    HAPPY: 'happy',
    FACTUAL: 'factual',
    COMMUNITY: 'community', 
    HYPE: 'hype',
    MINIMALIST: 'minimalist',
    ADVANCED_PERSONA: 'advanced_persona',
    CUSTOM: 'custom'
};

// 🔥 UPDATED PROMPT GENERATOR (Context & Hook Aware)
const generateReplyPrompt = ({
    comment,
    toneType,
    toneContent,
    videoTitle,
    authorName,
    isSafetyEnabled,
    hookStrategy // 🔥 New Parameter
}) => {
    let toneInstruction = "";

    if (PERSONAS[toneType]) {
        toneInstruction = PERSONAS[toneType].prompt;
    } else if (toneType === TONE_TYPES.ADVANCED_PERSONA) {
        toneInstruction = `Your Persona: "${toneContent || 'Helpful creator.'}"`;
    } else if (toneType === TONE_TYPES.CUSTOM) {
        toneInstruction = `Custom Style: "${toneContent || 'Professional.'}"`;
    } else {
        toneInstruction = PERSONAS['professional'].prompt;
    }

    const taskInstructions = isSafetyEnabled
        ? `1. **Analyze Safety:** Check for hate, spam, or high negativity.
           2. **Generate Reply:** If safe, reply. If flagged, return empty reply.`
        : `1. **Generate Reply:** Reply immediately. Always set status "safe".`;

    const statusInstruction = isSafetyEnabled ? `"safe" | "flagged"` : `"safe"`;

    return `
    You are a professional YouTube Creator. You are NOT an AI assistant or a customer service bot.
    
    **PERSONALITY:**
    ${toneInstruction}

    **CRITICAL ANTI-REPETITION RULES:**
    1. NEVER start with "Thank you for the comment," "I appreciate your feedback," or "Thanks for watching." These phrases are BANNED.
    2. VARIETY: For this specific reply, use this opening strategy: [${hookStrategy}].
    3. CONTEXT-FIRST: If the comment is a question, DO NOT greet. Answer the question immediately.
    4. HUMAN TOUCH: Use sentence fragments, varied lengths, and natural flow. Avoid "robotic politeness."
    5. MULTILANGUAGE: Detect the comment language and reply in that EXACT same language.

    Video: ${videoTitle || 'Current Video'}
    Comment by @${authorName || 'Viewer'}: "${comment}"

    **TASK:**
    ${taskInstructions}

    **OUTPUT FORMAT (JSON ONLY):**
    {
        "status": ${statusInstruction},
        "reply": "Your unique response here"
    }
    `;
};

export const generateReply = asyncHandler(async (req, res, next) => {
    const { comment: comment, tone, videoTitle, authorName, commentId } = req.body;
    const user = req.user;

    if (isGibberish(comment)) {
        return handleError(next, 'Invalid comment.', STATUS_CODES.BAD_REQUEST);
    }

    const limit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    if (user.affiliateTier !== 'tier1' && used >= limit) {
        return handleError(next, `Usage limit reached.`, STATUS_CODES.FORBIDDEN);
    }

    let requestedToneType = (tone || user.tone || 'professional').toLowerCase();

    let toneContent = "";
    if (requestedToneType === TONE_TYPES.CUSTOM) {
        toneContent = user.customToneDescription;
    } else if (requestedToneType === TONE_TYPES.ADVANCED_PERSONA) {
        toneContent = user.advancedPersonaInstruction;
    }

    // 🔥 RANDOM HOOK STRATEGY SELECTION
    const randomHook = HOOK_STRATEGIES[Math.floor(Math.random() * HOOK_STRATEGIES.length)];

    try {
        const isSafetyEnabled = user.notificationSettings?.aiCrisisDetection; 

        const prompt = generateReplyPrompt({
            comment,
            toneType: requestedToneType,
            toneContent,
            videoTitle,
            authorName,
            isSafetyEnabled,
            hookStrategy: randomHook // 🔥 Passing random strategy
        });

        const responseText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.9, // 🔥 High temperature for maximum variety
            maxTokens: 1000,
            responseMimeType: 'application/json'
        });

        let aiResult = { status: "safe", reply: "" };
        
        try {
            // Basic cleanup
            let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // JSON object extract karein
            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                // Check if the reply itself contains nested JSON strings
                let rawReply = parsed.reply || "";
                
                // 🔥 CLEANING ARTIFACTS: 
                // Agar AI ne "status": "safe" waghera text ke andar likh diya hai toh usay ura do
                rawReply = rawReply
                    .replace(/\\"/g, '"') // Unescape quotes
                    .replace(/\{"status":.*"reply":\s*"/gs, '') // Remove nested start
                    .replace(/"status":.*"reply":/gs, '') // Remove without brackets
                    .replace(/"\s*\}$/gs, '') // Remove trailing bracket
                    .replace(/^"/, '').replace(/"$/, ''); // Remove surrounding quotes

                aiResult = {
                    status: parsed.status || "safe",
                    reply: rawReply.trim()
                };
            } else {
                throw new Error("No JSON found");
            }
        } catch (e) {
            console.warn("AI JSON Parse Failed, using manual extraction");
            
            // Fallback: Sirf text nikalen jo quotes ke andar ho
            const replyMatch = responseText.match(/"reply":\s*"([\s\S]*?)"/);
            if (replyMatch && replyMatch[1]) {
                aiResult.reply = replyMatch[1].replace(/\\n/g, '\n').trim();
            } else {
                // Bilkul hi phat jaye toh plain text clean karke bhej do
                aiResult.reply = responseText
                    .replace(/\{[\s\S]*\}/g, '') // Remove any brackets
                    .replace(/"status":\s*"safe"/g, '')
                    .replace(/"reply":/g, '')
                    .replace(/[\\"{}]/g, '')
                    .trim();
            }
        }

        // 8. FINAL CLEANUP (Double check no junk remains)
        if (aiResult.reply.includes('"status":')) {
             // Agar ab bhi junk hai, toh last attempt to get the text after the last colon
             const parts = aiResult.reply.split(/["']: /);
             aiResult.reply = parts[parts.length - 1].replace(/[\\"{}]/g, '').trim();
        }


        if (aiResult.status === 'flagged') {
            await Notification.create({
                user: user._id,
                type: 'crisis_alert',
                message: `Risky comment from ${authorName}`,
                commentId: commentId
            });
        }

        res.json({
            success: true,
            status: aiResult.status || "safe",
            reply: aiResult.reply,
            usage: { used: user.repliesUsed, limit: limit }
        });

    } catch (err) {
        console.error("AI Error:", err);
        res.status(500).json({ message: "Failed to generate AI reply" });
    }
});

export default { generateReply };