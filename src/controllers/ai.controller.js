import { llmClient } from '../utils/llmClientStream.js';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js'; 
import { PERSONAS } from '../config/personas.js';

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

// Define Tone Types (Matches Frontend Keys)
const TONE_TYPES = {
    FRIENDLY: 'friendly',
    PROFESSIONAL: 'professional',
    HAPPY: 'happy', // Map to Hype Man or similar
    FACTUAL: 'factual', // Map to Minimalist
    
    // 🔥 New Personas (Magic Setup)
    COMMUNITY: 'community', 
    HYPE: 'hype',
    MINIMALIST: 'minimalist',
    
    // Advanced
    ADVANCED_PERSONA: 'advanced_persona',
    CUSTOM: 'custom'
};

const validateAccess = (user, toneType) => {
     if (user.affiliateTier === 'tier1') {
        return; 
    }
    const plan = user.plan || PLANS.FREE;

    // Free/Basic/Pro logic... (Adjust as per your tiers)
    if (plan === PLANS.FREE) {
        // Free allows basic personas
        if (![TONE_TYPES.FRIENDLY, TONE_TYPES.PROFESSIONAL].includes(toneType)) {
             // throw { message: `Upgrade plan to unlock this tone.`, code: STATUS_CODES.FORBIDDEN };
        }
    }
    
    // Pro Plus: All Allowed
};


// 🔥 UPDATED PROMPT GENERATOR (Supports Personas & Safety)
const generateReplyPrompt = ({
    comment,
    toneType,
    toneContent,
    videoTitle,
    authorName,
    isSafetyEnabled
}) => {
    
    // 1. Determine Identity & Tone Instruction
    let toneInstruction = "";

    // Check if tone is one of the Magic Personas
    if (PERSONAS[toneType]) {
        toneInstruction = PERSONAS[toneType].prompt;
    } 
    // Handle Advanced/Custom
    else if (toneType === TONE_TYPES.ADVANCED_PERSONA) {
        toneInstruction = `Your Persona Instructions: "${toneContent || 'Be helpful.'}"`;
    } 
    else if (toneType === TONE_TYPES.CUSTOM) {
        toneInstruction = `Custom Tone Style: "${toneContent || 'Professional and engaging'}"`;
    } 
    // Fallback to old keys mapping or default
    else {
        // Map old keys to new logic if needed
        if(toneType === 'friendly') toneInstruction = PERSONAS['community'].prompt;
        else if(toneType === 'happy') toneInstruction = PERSONAS['hype'].prompt;
        else toneInstruction = PERSONAS['professional'].prompt;
    }

    // 2. Safety Logic
    const taskInstructions = isSafetyEnabled
        ? `1. **Analyze Safety:** Check if the comment is negative, hate speech, spam, controversial, or requires careful manual review.
           2. **Generate Reply:** If safe, generate a reply based on the tone. If flagged, leave reply empty.`
        : `1. **Generate Reply:** Start generating the reply immediately based on the provided tone. DO NOT check for flags or safety. Always set status to "safe".
           2. **Reply Generation:** Create a relevant, engaging reply to the comment.`;

    const statusInstruction = isSafetyEnabled ? `"safe" | "flagged"` : `"safe"`;

    return `
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
    - Detect the language of the comment and reply in the same language.
    - If input has "[CONTEXT START]", reply to the last person.
    - Output ONLY valid JSON.
    `;
};

// --- CONTROLLER ---
export const generateReply = asyncHandler(async (req, res, next) => {
    const {
        comment: comment,
        tone,
        videoTitle,
        authorName,
        commentId, 
        draftOnly 
    } = req.body;

    const user = req.user;

    if (isGibberish(comment)) {
        return handleError(next, 'Comment text is invalid.', STATUS_CODES.BAD_REQUEST);
    }

    // 1. Check Usage Limit
    const limit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    // VIPs Bypass Limit (Assuming logic handled in middleware or here)
    if (user.affiliateTier !== 'tier1' && used >= limit) {
        return handleError(next, `Usage limit reached (${used}/${limit}).`, STATUS_CODES.FORBIDDEN);
    }

    // 2. Determine Requested Tone
    // Priority: Request Body -> User Profile -> Default
    let requestedToneType = (tone || user.tone || 'professional').toLowerCase();

    // 3. Extract Custom Content if needed
    let toneContent = "";
    if (requestedToneType === TONE_TYPES.CUSTOM) {
        toneContent = user.customToneDescription;
    } else if (requestedToneType === TONE_TYPES.ADVANCED_PERSONA) {
        toneContent = user.advancedPersonaInstruction;
    }

    try {
        // 4. Calculate Safety Setting
        // 4. Calculate Safety Setting
        // const isEligibleForSafety = user.plan === PLANS.PRO_PLUS || user.affiliateTier === 'tier1';
        const isEligibleForSafety = true; // Enabled for ALL Plans now (Free, Basic, Pro, Pro+)
        const userPref = user.notificationSettings?.aiCrisisDetection;
        
        // Safety is ON only if User is Eligible AND has Enabled it
        // (For Magic Setup users, aiCrisisDetection defaults to true)
        // const isSafetyEnabled = isEligibleForSafety && userPref;
    const isSafetyEnabled = user.notificationSettings?.aiCrisisDetection; 

        // 5. Generate Prompt
        const prompt = generateReplyPrompt({
            comment,
            toneType: requestedToneType,
            toneContent,
            videoTitle,
            authorName,
            isSafetyEnabled 
        });

        // 6. Call LLM
        const responseText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.4, // 🔥 Lowered for stability
            maxTokens: 1000,
            responseMimeType: 'application/json'
        });

        // 7. Parse Response
        let aiResult;
        try {
            // Remove markdown code blocks if present
            let cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            // Sometimes AI adds text before/after JSON, extract the JSON object
            const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleanedText = jsonMatch[0];
            }

            aiResult = JSON.parse(cleanedText);
        } catch (e) {
            console.warn("AI JSON Parse Failed", e);
            console.log("Raw Response:", responseText);

            // 🔥 Fallback: Extract 'reply' field manually using Regex if JSON is broken/truncated
            const replyMatch = responseText.match(/"reply":\s*"([\s\S]*?)"/);
            
            if (replyMatch && replyMatch[1]) {
                aiResult = { 
                    status: "safe", 
                    reply: replyMatch[1] 
                };
            } else {
                 // If total failure, just return text but clean up JSON-like artifacts
                 aiResult = { 
                    status: "safe", 
                    reply: responseText.replace(/[{}]/g, '').replace(/"status":\s*"safe",?/g, '').replace(/"reply":/g, '').trim() 
                };
            }
        }

        // 8. Handle Notifications
        if (aiResult.status === 'flagged') {
            await Notification.create({
                user: user._id,
                type: 'crisis_alert',
                message: `Risky comment detected from ${authorName}: "${comment.substring(0, 30)}..."`,
                commentId: commentId,
                isRead: false
            });
        }

        // 9. Send Response
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