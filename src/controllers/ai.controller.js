import { llmClient } from '../utils/llmClientStream.js';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js'; // 🔥 IMPORT ADDED

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

const TONE_INSTRUCTIONS = {
    [TONE_TYPES.FRIENDLY]: "Tone: Friendly, approachable, and uses casual language with a few emojis like 😊 or 👍.",
    [TONE_TYPES.PROFESSIONAL]: "Tone: Strictly professional, concise, and polite. Do not use emojis or slang.",
    [TONE_TYPES.HAPPY]: "Tone: High energy, very enthusiastic! Use exclamation marks and hype emojis like 🔥 and 🚀.",
    [TONE_TYPES.FACTUAL]: "Tone: Direct, objective, and focuses on facts. No fluff or emotion.",
};

const validateAccess = (user, toneType) => {
     if (user.affiliateTier === 'tier1') {
        return; 
    }
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
};


const generateReplyPrompt = ({
    comment,
    toneType,
    toneContent,
    videoTitle,
    authorName,
    isSafetyEnabled // 🔥 NEW PARAMETER
}) => {
    let identity = `You are a professional YouTube Creator's assistant.`;
    let toneInstruction = "";

    if (toneType === TONE_TYPES.ADVANCED_PERSONA) {
        identity = ""; 
        toneInstruction = `Your Persona Instructions: "${toneContent || 'Be helpful.'}"`;
    } else if (toneType === TONE_TYPES.CUSTOM) {
        toneInstruction = `Custom Tone Style: "${toneContent || 'Professional and engaging'}"`;
    } else {
        toneInstruction = TONE_INSTRUCTIONS[toneType] || TONE_INSTRUCTIONS.FRIENDLY;
    }

    // 🔥 UPDATED SAFETY LOGIC BASED ON SETTING
    const taskInstructions = isSafetyEnabled
        ? `1. **Analyze Safety:** Check if the comment is negative, hate speech, spam, controversial, or requires careful manual review.
           2. **Generate Reply:** If safe, generate a reply based on the tone. If flagged, leave reply empty.`
        : `1. **Generate Reply:** Start generating the reply immediately based on the provided tone. DO NOT check for flags or safety. Always set status to "safe".
           2. **Reply Generation:** Create a relevant, engaging reply to the comment.`;

    const statusInstruction = isSafetyEnabled ? `"safe" | "flagged"` : `"safe"`;

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
        commentId, // 🔥 Needed for notification linking
        draftOnly 
    } = req.body;

    const user = req.user;

    if (isGibberish(comment)) {
        return handleError(next, 'Comment text is invalid.', STATUS_CODES.BAD_REQUEST);
    }

    const limit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    if (used >= limit) {
        return handleError(next, `Usage limit reached (${used}/${limit}). Please Upgrade.`, STATUS_CODES.FORBIDDEN);
    }

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

    try {
        validateAccess(user, requestedToneType);
    } catch (permError) {
        return handleError(next, permError.message, permError.code || 403);
    }

    let toneContent = "";
    if (requestedToneType === TONE_TYPES.CUSTOM) {
        toneContent = user.customToneDescription;
    } else if (requestedToneType === TONE_TYPES.ADVANCED_PERSONA) {
        toneContent = user.advancedPersonaInstruction;
    }

    try {
        // 🔥 CALCULATE SAFETY SETTING
        // User must be eligible (Pro Plus/VIP) AND have setting ON
        const isEligible = user.plan === PLANS.PRO_PLUS || user.affiliateTier === 'tier1';
        const userPref = user.notificationSettings?.aiCrisisDetection;
        const isSafetyEnabled = isEligible && userPref;

        const prompt = generateReplyPrompt({
            comment,
            toneType: requestedToneType,
            toneContent,
            videoTitle,
            authorName,
            isSafetyEnabled // 🔥 Pass Setting
        });

        const responseText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.7,
            maxTokens: 1000,
            responseMimeType: 'application/json'
        });

        let aiResult;
        try {
            const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            aiResult = JSON.parse(cleanedText);
        } catch (e) {
            console.warn("AI JSON Parse Failed", e);
            aiResult = { status: "safe", reply: responseText };
        }

        // 🔥 NOTIFICATION TRIGGER LOGIC
        if (aiResult.status === 'flagged') {
            await Notification.create({
                user: user._id,
                type: 'crisis_alert',
                message: `Risky comment detected from ${authorName}: "${comment.substring(0, 30)}..."`,
                commentId: commentId,
                isRead: false
            });
            console.log("🔔 Crisis Notification Created");
        }

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