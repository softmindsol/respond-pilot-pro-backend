import { llmClient } from '../utils/llmClientStream.js';
import User from '../models/user.model.js';

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
    FACTUAL: 'factual',
    HAPPY: 'happy',
    PROFESSIONAL: 'professional',
    ADVANCED_PERSONA: 'advanced_persona',
    CUSTOM: 'custom'
};

// Prompt Definitions
const TONE_INSTRUCTIONS = {
    [TONE_TYPES.FRIENDLY]: "Tone: Friendly, approachable, and uses casual language with a few emojis like 😊 or 👍.",
    [TONE_TYPES.PROFESSIONAL]: "Tone: Strictly professional, concise, and polite. Do not use emojis or slang.",
    [TONE_TYPES.HAPPY]: "Tone: High energy, very enthusiastic! Use exclamation marks and hype emojis like 🔥 and 🚀.",
    [TONE_TYPES.FACTUAL]: "Tone: Direct, objective, and focuses on facts. No fluff or emotion.",
};

const validateAccess = (user, toneType) => {
    const plan = user.plan || PLANS.FREE;

    if (plan === PLANS.FREE) {
        if (toneType !== TONE_TYPES.FRIENDLY) {
            throw { message: `Free plan only supports 'Friendly' tone. Upgrade to unlock more.`, code: STATUS_CODES.FORBIDDEN };
        }
    }

    if (plan === PLANS.BASIC) {
        if (toneType === TONE_TYPES.CUSTOM || toneType === TONE_TYPES.ADVANCED_PERSONA) {
            throw { message: `Custom, and Advanced Persona tones are for Pro users.`, code: STATUS_CODES.FORBIDDEN };
        }
    }

    if (plan === PLANS.PRO) {
        if (toneType === TONE_TYPES.ADVANCED_PERSONA) {
            throw { message: `Advanced Persona is for Pro Plus users.`, code: STATUS_CODES.FORBIDDEN };
        }
    }

    // Pro Plus: All Allowed
};


const generateReplyPrompt = ({
    comment,
    toneType,
    toneContent,
    videoTitle,
    authorName,
    userPlan
}) => {
    // 1. Base Identity
    let identity = `You are a professional YouTube Creator's assistant.`;
    let toneInstruction = "";

    console.log("userPlan:",userPlan);
    // 2. Determine Tone Instruction
    if (toneType === TONE_TYPES.ADVANCED_PERSONA) {
        identity = ""; // Persona overrides base identity
        toneInstruction = `Your Persona Instructions: "${toneContent || 'Be helpful.'}"`;
    } else if (toneType === TONE_TYPES.CUSTOM) {
        toneInstruction = `Custom Tone Style: "${toneContent || 'Professional and engaging'}"`;
    } else {
        toneInstruction = TONE_INSTRUCTIONS[toneType] || TONE_INSTRUCTIONS.FRIENDLY;
    }

    // 3. Safety Check Logic based on Plan
    const isProPlus = userPlan === PLANS.PRO_PLUS;

    const taskInstructions = isProPlus
        ? `1. **Analyze Safety:** Check if the comment is negative, hate speech, spam, controversial, or requires careful manual review.
    2. **Generate Reply:** If safe, generate a reply based on the tone. If flagged, leave reply empty or provide a neutral placeholder.`
        : `1. **Generate Reply:** Start generating the reply immediately based on the provided tone. Do not check for flags status or safety labels. Always set status to "safe".
    2. **Reply Generation:** Create a relevant, engaging reply to the comment.`;

    const statusInstruction = isProPlus ? `"safe" | "flagged"` : `"safe"`;

    // 4. Build Final Prompt for JSON Output
    return `
    ${identity}
    ${toneInstruction}

    Video Context: ${videoTitle || 'General Content'}

    --- INPUT MESSAGE / CONTEXT ---
    ${comment}
    -------------------------------

    **TASK:**
    ${taskInstructions}

    **OUTPUT FORMAT (JSON):**
    {
        "status": ${statusInstruction},
        "reply": "Your generated reply text here"
    }
    
    **Instructions:**
    - If the input contains "[CONTEXT START]", reply specifically to the LAST person mentioned.
    - Output ONLY valid JSON.
    `;
};

// NON-STREAMING VERSION
export const generateReply = asyncHandler(async (req, res, next) => {
    const {
        comment: comment,
        tone,
        videoTitle,
        authorName,
        draftOnly // New flag to skip usage counting if it's just a draft
    } = req.body;

    const user = req.user;

    // Basic validation
    if (isGibberish(comment)) {
        return handleError(next, 'Comment text is invalid.', STATUS_CODES.BAD_REQUEST);
    }

    // 1. CHECK USAGE LIMIT (Skip check if we just want a draft for the UI to show "AI is writing...")
    // Ideally, drafts count towards usage ONLY when approved, OR we charge small amount. 
    // For now, let's count generation as usage to prevent abuse.
    const limit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    if (used >= limit) {
        return handleError(next, `Usage limit reached (${used}/${limit}). Please Upgrade.`, STATUS_CODES.FORBIDDEN);
    }

    // 2. NORMALIZE TONE
    let requestedToneType = (tone || user.tone || 'friendly').toLowerCase();

    const toneMap = {
        'engaging': 'happy',
        'grateful': 'friendly',
        'humorous': 'friendly',
        'empathetic': 'friendly'
    };
    if (toneMap[requestedToneType]) requestedToneType = toneMap[requestedToneType];

    if (!Object.values(TONE_TYPES).includes(requestedToneType)) {
        requestedToneType = 'friendly';
    }

    // 3. VALIDATE PLAN PERMISSIONS
    try {
        validateAccess(user, requestedToneType);
    } catch (permError) {
        return handleError(next, permError.message, permError.code || 403);
    }

    // 4. EXTRACT TONE CONTENT
    let toneContent = "";
    if (requestedToneType === TONE_TYPES.CUSTOM) {
        toneContent = user.customToneDescription;
    } else if (requestedToneType === TONE_TYPES.ADVANCED_PERSONA) {
        toneContent = user.advancedPersonaInstruction;
    }

    try {
        // 5. GENERATE PROMPT
        // 5. GENERATE PROMPT
        const prompt = generateReplyPrompt({
            comment,
            toneType: requestedToneType,
            toneContent,
            videoTitle,
            authorName,
            userPlan: user.plan || PLANS.FREE
        });

        // 6. CALL LLM (Force JSON output)
        // Ensure your llmClient or model config supports JSON mode if possible, 
        // otherwise rely on prompt instruction.
        const responseText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.7,
            maxTokens: 1000,
            responseMimeType: 'application/json'
        });

        // 7. PARSE JSON RESPONSE
        let aiResult;
        try {
            // Clean up markdown code blocks if any (just in case, though JSON mode usually avoids them)
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            aiResult = JSON.parse(cleanedText);
        } catch (e) {
            console.warn("AI JSON Parse Failed, trying to extract content from malformed JSON:", e);
            // Robust extraction if JSON is malformed or truncated
            const statusMatch = responseText.match(/"status":\s*"([^"]+)"/i);
            const replyMatch = responseText.match(/"reply":\s*"([^"]+)(?:"|$)/i);

            aiResult = {
                status: statusMatch ? statusMatch[1] : "safe",
                reply: replyMatch ? replyMatch[1] : responseText.substring(0, 1000)
            };

            // If the reply still contains JSON structure, it means extraction failed
            if (aiResult.reply.includes('{"status":') || aiResult.reply.length < 5) {
                aiResult.reply = "I apologize, but I couldn't generate a complete reply. Please try again.";
            }
        }

        // 8. UPDATE USAGE (Only if we are NOT in draft-only mode, or if you want to charge for drafts)
        // Client requirement says "automated drafting", so this happens A LOT. 
        // Usually, you might want to only increment `repliesUsed` when they click "Approve". 
        // But for MVP, let's keep it simple or maybe assume drafts are cheap.

        // user.repliesUsed = (user.repliesUsed || 0) + 1;
        // await user.save();

        res.json({
            success: true,
            status: aiResult.status || "safe",
            reply: aiResult.reply,
            usage: {
                used: user.repliesUsed,
                limit: limit
            }
        });

    } catch (err) {
        console.error("AI Generation Error:", err);
        res.status(500).json({ message: "Failed to generate AI reply" });
    }
});


export default {
    generateReply
};
