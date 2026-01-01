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
    commentText,
    toneType,
    userTone, // The content of user.tone (e.g., custom description or persona instruction)
    videoTitle,
    authorName
}) => {
    // Base Identity
    let identity = `You are a professional YouTube Creator.`;
    let toneInstruction = "";

    // Determine instruction based on toneType
    if (TONE_INSTRUCTIONS[toneType]) {
        // Standard Tone
        toneInstruction = TONE_INSTRUCTIONS[toneType];
    } else if (toneType === TONE_TYPES.CUSTOM) {
        // Custom Tone (Short & Simple)
        toneInstruction = `Tone: ${userTone || 'Professional & Engaging'}`;
    } else if (toneType === TONE_TYPES.ADVANCED_PERSONA) {
        // Advanced Persona (Detailed)
        if (userTone) {
            identity = ""; // Clear base identity as persona likely covers it
            toneInstruction = userTone;
        } else {
            toneInstruction = "Tone: Professional";
        }
    } else {
        // Fallback
        toneInstruction = TONE_INSTRUCTIONS[TONE_TYPES.FRIENDLY];
    }

    return `${identity}
    
    Your task is to write a reply to a user's comment.

    User Comment: "${commentText}"
    User Name: ${authorName || 'Viewer'}
    Video Context: ${videoTitle || 'General Video'}
    
    ${toneInstruction}
    
    Requirements:
    - Keep it concise (under 500 characters).
    - If the user asks a question, answer it briefly or thank them.
    - Do not include hashtags unless asked.
    - Output ONLY the reply text, no quotes.`;
};

// NON-STREAMING VERSION
export const generateReply = asyncHandler(async (req, res, next) => {
    const {
        commentText,
        comment,
        tone,
        videoTitle,
        authorName
    } = req.body;

    console.log(req.body);
    const user = req.user; // From protect middleware

    const actualComment = commentText || comment;

    if (isGibberish(actualComment)) {
        return handleError(
            next,
            'Comment text is invalid or too short.',
            STATUS_CODES.BAD_REQUEST
        );
    }

    // 1. CHECK USAGE LIMIT
    const limit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    if (used >= limit) {
        return handleError(
            next,
            `Usage limit reached. You have used ${used}/${limit} replies. Please Top Up or Upgrade to continue.`,
            STATUS_CODES.FORBIDDEN
        );
    }

    // Default tone normalization
    let requestedToneType = (tone || 'friendly').toLowerCase();

    // Normalize old UI values if needed
    if (requestedToneType === 'engaging') requestedToneType = 'happy';
    if (requestedToneType === 'grateful') requestedToneType = 'friendly';
    if (requestedToneType === 'humorous') requestedToneType = 'friendly';
    if (requestedToneType === 'empathetic') requestedToneType = 'friendly';

    if (!Object.values(TONE_TYPES).includes(requestedToneType)) {
        if (!['friendly', 'factual', 'happy', 'professional', 'advanced_persona', 'custom'].includes(requestedToneType)) {
            requestedToneType = 'friendly';
        }
    }

    // 2. VALIDATE PERMISSIONS
    try {
        validateAccess(user, requestedToneType);
    } catch (permError) {
        return handleError(next, permError.message, permError.code || 403);
    }

    try {
        // 3. GENERATE PROMPT
        const prompt = generateReplyPrompt({
            commentText: actualComment,
            toneType: requestedToneType,
            userTone: user.tone, // Pass stored custom tone/persona
            videoTitle,
            authorName
        });

        const replyText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.7,
            maxTokens: 500
        });

        // 4. INCREMENT USAGE
        user.repliesUsed = (user.repliesUsed || 0) + 1;
        await user.save();

        res.json({
            reply: replyText,
            success: true,
            planUsed: user.plan,
            usage: {
                used: user.repliesUsed,
                limit: limit
            }
        });

    } catch (err) {
        console.error("AI Error:", err);
        res.status(500).json({ message: "Failed to generate AI reply" });
    }
});

export default {
    generateReply
};
