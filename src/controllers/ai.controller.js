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

const PRESET_TONES = {
    FRIENDLY: 'Friendly',
    PROFESSIONAL: 'Professional',
    ENGAGING: 'Engaging',
    GRATEFUL: 'Grateful',
    HUMOROUS: 'Humorous',
    EMPATHETIC: 'Empathetic'
};

// Access Control Logic
// Access Control Logic
const checkPlanPermissions = (userPlan, requestedTone, userCustomTone) => {
    const plan = userPlan || PLANS.FREE;
    const toneKey = (requestedTone || '').toLowerCase();

    // If user provided a custom "Style/Persona" in their settings (saved in user.tone)
    // We only allow it effectively if they are Pro+.
    // Actually, user said "tone field me store krni hai". 
    // AND "frontend me jesi mirza ae to tmne just store krni hai".
    // This implies the storage part is handled. 
    // USAGE part: If they want to USE that stored tone, they likely send a flag or we check it?
    // Let's assume if they send "custom" as tone, or if we use the stored one.

    // Re-reading: "use tone field in model".

    // 1. Check Custom Tone Access (Pro & ProPlus)
    // If they are trying to use a Custom Tone (which might be passed or stored)
    // For now, let's keep simple checks on the 'requestedTone' string if it matches a preset.
};

const validateAccess = (user, requestedTone) => {
    const plan = user.plan || PLANS.FREE;
    const toneKey = (requestedTone || '').toLowerCase();

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

    // Pro/ProPlus: All tones allowed.
};


const generateReplyPrompt = ({
    commentText,
    tone,
    customTone, // This comes from user.tone
    videoTitle,
    authorName
}) => {
    // Base Identity
    let identity = `You are a professional YouTube Creator.`;

    // Determine specific tone instruction
    // If 'tone' param is 'Custom', use the user.tone string.
    let toneInstruction = `Tone: ${tone || 'Professional & Engaging'}`;

    // If they selected 'Custom' (or logic allows it) and have a custom tone saved:
    if (customTone && tone === 'Custom') {
        toneInstruction = `Tone/Style/Persona: ${customTone}`;
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
        validateAccess(user, requestedTone);
        // Custom Tone check: If requesting 'Custom' tone, must be Pro/ProPlus
        if (requestedTone === 'Custom') {
            if (user.plan !== PLANS.PRO && user.plan !== PLANS.PRO_PLUS) {
                throw { message: 'Custom Tone is available on Pro or Pro Plus plans.', code: STATUS_CODES.FORBIDDEN };
            }
        }
    } catch (permError) {
        return handleError(next, permError.message, permError.code || 403);
    }

    try {
        const prompt = generateReplyPrompt({
            commentText: actualComment,
            tone: requestedTone,
            customTone: user.tone, // Pass stored custom tone
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
