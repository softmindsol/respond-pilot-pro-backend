import { llmClient } from '../utils/llmClientStream.js';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js'; 
import { PERSONAS } from '../config/personas.js';

// --- 🔥 NEW: HOOK DIVERSITY STRATEGIES ---
const HOOK_STRATEGIES = [
    "Jump into the solution or answer immediately without any greeting.",
    "Mention a specific keyword or noun the user used in your first 3 words.",
    "Start with 'Actually,' or 'The interesting thing is,' to provide a counter-perspective.",
    "Start with 'Spot on.', 'Exactly.', or 'Couldn't agree more.' to show agreement.",
    "Explain the reason or 'why' behind the topic immediately.",
    "Address the user directly by name: 'Hey @[authorName],'",
    "Use 1-2 punchy emojis at the very beginning, then start the text.",
    "Start with a strong reactionary word like 'Facts.', 'Wild.', 'Huge.', or 'Legacy move.'",
    "Ask the user a thought-provoking follow-up question in the first sentence.",
    "Share a personal observation about the making of the video.",
    "Correct a detail politely by starting with 'Close! It's actually...'",
    "Show excitement immediately: 'Let's go! Glad someone caught that.'",
    "Keep the whole response under 15 words and start with the core point.",
    "Start with 'Personally, I feel...' to give a creator's perspective.",
    "Be action-oriented: Start with 'On it!' or 'Adding this to my notes!'"
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


const generateReplyPrompt = ({
    comment,
    toneType,
    toneContent,
    videoTitle,
    authorName,
    isSafetyEnabled,
    hookStrategy
}) => {
    const basePersona = PERSONAS[toneType]?.prompt || PERSONAS['professional'].prompt;

    return `
    ${basePersona}
    ${toneContent ? `Additional Tone Instructions: ${toneContent}` : ""}

    **STRICT OPERATING PROCEDURES (US MARKET STANDARD):**
    1. **NO PREFIXES:** Do NOT include any labels, tactic names, or prefixes like "The Insight:", "Reply:", or "Status:".
    2. **CRITIQUE DETECTION (SMART DEFENSE):** 
       - If @${authorName} is skeptical, doubts your strategy, or gives negative feedback about the video/content:
       - ACTION: Do NOT apologize. Do NOT be a bot. Write a logical, short, and firm defense of your position.
       - STATUS: You MUST set "status" to "flagged".
    
    3. **COMPLETENESS RULE:**
       - Every response must be 1 to 3 FULL sentences. 
       - End with a period (.), exclamation mark (!), or question mark (?). 
       - NEVER stop mid-sentence.

    4. **BANNED PHRASES:**
       - "Thank you for the comment", "Thanks for watching", "I appreciate your feedback".

    5. **OPENING STRIKE:**
       - Start your message using this strategy: [${hookStrategy}]
       - Jump straight to the point. No bot-filler.

    6. **MULTILANGUAGE:** 
       - Detect the comment language and reply in the EXACT SAME language.

    Video Context: "${videoTitle || 'Current Video'}"
    Target User: @${authorName || 'Viewer'}
    User Input: "${comment}"

    **OUTPUT FORMAT (STRICT JSON ONLY):**
    {
        "status": "safe" | "flagged",
        "reply": "Your full text response here"
    }
    `;
};

export const generateReply = asyncHandler(async (req, res, next) => {
    const { comment, tone, videoTitle, authorName, commentId } = req.body;
    const user = req.user;

    if (!comment || comment.trim().length < 2) {
        return handleError(next, 'Comment is too short.', STATUS_CODES.BAD_REQUEST);
    }

    // 1. LIMIT CHECK
    const used = user.repliesUsed || 0;
    const limit = user.repliesLimit || 50;
    if (user.affiliateTier !== 'tier1' && used >= limit) {
        return handleError(next, `Usage limit reached.`, STATUS_CODES.FORBIDDEN);
    }

    // 2. TONE RESOLUTION
    const requestedToneType = (tone || user.tone || 'professional').toLowerCase();
    let toneContent = requestedToneType === 'custom' ? user.customToneDescription : 
                      requestedToneType === 'advanced_persona' ? user.advancedPersonaInstruction : "";

    // 3. STYLE SEED
    const randomHook = HOOK_STRATEGIES[Math.floor(Math.random() * HOOK_STRATEGIES.length)];

    try {
        const isSafetyEnabled = user.notificationSettings?.aiCrisisDetection; 

        // 4. LLM CALL (Gemini 2.0 Flash)
        const responseText = await llmClient({
            model: 'gemini-2.0-flash', 
            prompt: generateReplyPrompt({
                comment,
                toneType: requestedToneType,
                toneContent,
                videoTitle,
                authorName,
                isSafetyEnabled,
                hookStrategy: randomHook
            }),
            temperature: 0.8, // Higher creativity for natural tone
            maxTokens: 1024,
            responseMimeType: 'application/json'
        });

        // 5. ROBUST PARSING & REPAIR
        let aiResult = { status: "safe", reply: "" };
        try {
            const firstBrace = responseText.indexOf('{');
            const lastBrace = responseText.lastIndexOf('}');
            let cleanJson = responseText.substring(firstBrace, lastBrace + 1);
            
            if (!cleanJson.endsWith('}')) cleanJson += '"}';
            const parsed = JSON.parse(cleanJson);
            
            let finalReply = (parsed.reply || "")
                .replace(/^status:\s*flagged,?\s*/is, '')
                .replace(/^reply:\s*/is, '')
                .replace(/\\"/g, '"')
                .trim();

            aiResult = { status: parsed.status || "safe", reply: finalReply };
        } catch (e) {
            const replyMatch = responseText.match(/"reply":\s*"([\s\S]*?)"/);
            aiResult.reply = replyMatch ? replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim() : "";
            aiResult.status = responseText.includes("flagged") ? "flagged" : "safe";
        }

        // 6. SENTENCE COMPLETION AUTO-REPAIR
        const unfinishedWords = ['that', 'the', 'and', 'with', 'for', 'a', 'of', 'this', 'is', 'to'];
        const wordsArr = aiResult.reply.split(' ');
        const lastWord = wordsArr.pop()?.toLowerCase().replace(/[^a-z]/g, '');
        
        if (unfinishedWords.includes(lastWord) || !/[.!?]$/.test(aiResult.reply)) {
            const lastPoint = aiResult.reply.lastIndexOf('.');
            if (lastPoint > 15) {
                aiResult.reply = aiResult.reply.substring(0, lastPoint + 1);
            }
        }

        // 7. NOTIFICATION TRIGGER
        if (aiResult.status === 'flagged') {
            await Notification.create({
                user: user._id,
                type: 'crisis_alert',
                message: `Review Needed: Critique from @${authorName}`,
                commentId
            });
        }

        // 8. FINAL RESPONSE
        res.json({
            success: true,
            status: aiResult.status,
            reply: aiResult.reply,
            usage: { used: user.repliesUsed, limit: limit }
        });

    } catch (err) {
        console.error("Gemini Error:", err);
        res.status(500).json({ message: "AI Engine is syncing. Please try again." });
    }
});

export default { generateReply };