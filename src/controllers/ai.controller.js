import { llmClient } from '../utils/llmClientStream.js';

// Utils 
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const STATUS_CODES = {
    BAD_REQUEST: 400,
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

const generateReplyPrompt = ({
    commentText,
    tone,
    videoTitle,
    authorName
}) => {
    return `You are a professional YouTube Creator. Your task is to write a reply to a user's comment.

    User Comment: "${commentText}"
    User Name: ${authorName || 'Viewer'}
    Video Context: ${videoTitle || 'General Video'}
    
    tone: ${tone || 'Professional & Engaging'}
    
    Requirements:
    - Keep it concise (under 500 characters).
    - Be friendly and encouraging.
    - If the user asks a question, answer it briefly or thank them.
    - Do not include hashtags unless asked.
    - Output ONLY the reply text, no quotes.`;
};

// NON-STREAMING VERSION
// Just returns { reply: "..." }
export const generateReply = asyncHandler(async (req, res, next) => {
    const {
        commentText,
        comment,
        tone,
        videoTitle,
        authorName
    } = req.body;
    console.log("authorName:", authorName);
    const actualComment = commentText || comment;
    console.log("actualComment:", actualComment)
    if (isGibberish(actualComment)) {
        return handleError(
            next,
            'Comment text is invalid or too short.',
            STATUS_CODES.BAD_REQUEST
        );
    }

    try {
        const prompt = generateReplyPrompt({
            commentText: actualComment,
            tone,
            videoTitle,
            authorName
        });

        const replyText = await llmClient({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.7,
            maxTokens: 500
        });

        // Simple JSON Response
        res.json({
            reply: replyText,
            success: true
        });

    } catch (err) {
        console.error("AI Error:", err);
        res.status(500).json({ message: "Failed to generate AI reply" });
    }
});

export default {
    generateReply
};
