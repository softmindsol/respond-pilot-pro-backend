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
    PRO_PLUS: 'ProPlus'
};

const PRESET_TONES = {
    FRIENDLY: 'Friendly',
    PROFESSIONAL: 'Professional',
    ENGAGING: 'Engaging',
    GRATEFUL: 'Grateful',
    HUMOROUS: 'Humorous',
    EMPATHETIC: 'Empathetic'
};

// Access Control Logic
const checkPlanPermissions = (userPlan, requestedTone, customToneDescription, personaInstruction) => {
    const plan = userPlan || PLANS.FREE;
    const toneKey = (requestedTone || '').toLowerCase();

    // 1. Check Persona Access (ProPlus Only)
    if (personaInstruction && plan !== PLANS.PRO_PLUS) {
        throw { message: 'Advanced Persona Instructions are only available on the Pro Plus plan.', code: STATUS_CODES.FORBIDDEN };
    }

    // 2. Check Custom Tone Description Access (Pro & ProPlus)
    if (customToneDescription) {
        if (plan !== PLANS.PRO && plan !== PLANS.PRO_PLUS) {
            throw { message: 'Custom Tone Descriptions are available on Pro and Pro Plus plans.', code: STATUS_CODES.FORBIDDEN };
        }
    }

    // 3. Check Standard Tone Access
    // Free: Friendly Only
    if (plan === PLANS.FREE) {
        if (toneKey !== PRESET_TONES.FRIENDLY.toLowerCase()) {
            throw { message: `Free plan only supports '${PRESET_TONES.FRIENDLY}' tone. Upgrade to unlock more.`, code: STATUS_CODES.FORBIDDEN };
        }
    }

    // Basic: Friendly & Professional
    if (plan === PLANS.BASIC) {
        const allowed = [PRESET_TONES.FRIENDLY.toLowerCase(), PRESET_TONES.PROFESSIONAL.toLowerCase()];
        if (!allowed.includes(toneKey)) {
            throw { message: `Basic plan only supports Friendly and Professional tones. Upgrade to Pro for more.`, code: STATUS_CODES.FORBIDDEN };
        }
    }

    // Pro & Above: All Presets are allowed.
};


const generateReplyPrompt = ({
    commentText,
    tone,
    customToneDescription,
    personaInstruction,
    videoTitle,
    authorName
}) => {
    // Base Identity
    let identity = `You are a professional YouTube Creator.`;

    // Override Identity if Persona is present (Pro Plus)
    if (personaInstruction) {
        identity = `You are a specific persona defined as follows: "${personaInstruction}". Act strictly according to this persona.`;
    }

    // Determine specific tone instruction
    let toneInstruction = `Tone: ${tone || 'Professional & Engaging'}`;
    if (customToneDescription) {
        toneInstruction = `Tone/Style: ${customToneDescription}`; // Pro/ProPlus custom override
    }

    return `${identity}
    
    Your task is to write a reply to a user's comment.

    User Comment: "${commentText}"
    User Name: ${authorName || 'Viewer'}
    Video Context: ${videoTitle || 'General Video'}
    
    ${toneInstruction}
    
    Requirements:
    - Keep it concise (under 500 characters).
    - Be friendly and encouraging (unless persona dictates otherwise).
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
        customToneDescription,
        personaInstruction,
        videoTitle,
        authorName
    } = req.body;

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
    // Use DATABASE FIELD (repliesLimit) instead of hardcoded map
    const limit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    if (used >= limit) {
        return handleError(
            next,
            `Usage limit reached. You have used ${used}/${limit} replies. Please Top Up or Upgrade to continue.`,
            STATUS_CODES.FORBIDDEN
        );
    }

    // Default tone if missing
    const requestedTone = tone || PRESET_TONES.FRIENDLY;

    // 2. VALIDATE PERMISSIONS
    try {
        checkPlanPermissions(user.plan, requestedTone, customToneDescription, personaInstruction);
    } catch (permError) {
        return handleError(next, permError.message, permError.code || 403);
    }

    try {
        const prompt = generateReplyPrompt({
            commentText: actualComment,
            tone: requestedTone,
            customToneDescription,
            personaInstruction,
            videoTitle,
            authorName
        });

        const replyText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.7,
            maxTokens: 500
        });

        // 3. INCREMENT USAGE
        // We do this after successful generation
        user.repliesUsed = (user.repliesUsed || 0) + 1;
        await user.save(); // Save to DB

        // Simple JSON Response
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
