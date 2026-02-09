import rateLimit from 'express-rate-limit';

export const syncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 syncs per window
    message: { message: "Too many sync requests. Please wait 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});