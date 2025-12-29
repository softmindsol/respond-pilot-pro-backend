import { llmClientStream } from '../utils/llmClientStream.js';

// Utils 
const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

const STATUS_CODES = {
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    TOO_MANY_REQUESTS: 429,
    UNAUTHORIZED: 401
};

const handleError = (next, message, statusCode) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    next(error);
};

const isGibberish = (text) => {
    if (!text || typeof text !== 'string') return true;
    return text.trim().length < 2;
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

export const generateReplyStream = asyncHandler(async (req, res, next) => {
    const {
        commentText,
        tone,
        videoTitle,
        authorName
    } = req.body;

    if (isGibberish(commentText)) {
        return handleError(
            next,
            'Comment text is invalid or too short.',
            STATUS_CODES.BAD_REQUEST
        );
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (res.flushHeaders) res.flushHeaders();

    let closed = false;
    let fullContent = '';
    let chunkCount = 0;
    const startTime = Date.now();

    res.on('close', () => (closed = true));
    res.on('error', () => (closed = true));

    const prompt = generateReplyPrompt({
        commentText,
        tone,
        videoTitle,
        authorName
    });

    const metadata = {
        type: 'Reply',
        commentText: commentText.substring(0, 50) + '...',
        requestedTone: tone,
        createdAt: new Date().toISOString(),
    };

    // Send initial metadata
    res.write(`data: ${JSON.stringify({
        type: 'metadata',
        data: metadata
    })}\n\n`);

    try {
        await llmClientStream({
            model: 'gemini-2.5-flash',
            prompt,
            temperature: 0.7,
            maxTokens: 300, // Replies are short
            onChunk: (chunk) => {
                if (closed) return;

                fullContent += chunk;
                chunkCount++;

                res.write(`data: ${JSON.stringify({
                    type: 'chunk',
                    chunk,
                    index: chunkCount,
                    timestamp: new Date().toISOString()
                })}\n\n`);
            }
        });

        if (closed) return;

        if (!fullContent.trim()) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                code: 'EMPTY_RESPONSE',
                message: 'AI returned empty content'
            })}\n\n`);
            return res.end();
        }

        res.write(`data: ${JSON.stringify({
            type: 'complete',
            data: {
                content: fullContent.trim(),
                statistics: {
                    chunksReceived: chunkCount,
                    totalDuration: Date.now() - startTime,
                }
            }
        })}\n\n`);

        res.end();

    } catch (err) {
        if (closed) return;
        console.error("Stream generation error:", err);

        let code = 'GENERATION_ERROR';
        let message = err.message || 'Failed to generate content';

        if (err.status === 503) {
            code = 'MODEL_OVERLOADED';
            message = 'AI model is busy.';
        } else if (err.status === 429) {
            code = 'RATE_LIMIT';
            message = 'Rate limit exceeded.';
        } else if (err.status === 401 || err.status === 403) {
            code = 'API_KEY_ERROR';
            message = 'AI service authentication failed.';
        }

        res.write(`data: ${JSON.stringify({
            type: 'error',
            code,
            message,
            retryAfter: err.status === 503 ? 5 : undefined
        })}\n\n`);

        res.end();
    }
});

export default {
    generateReplyStream
};
