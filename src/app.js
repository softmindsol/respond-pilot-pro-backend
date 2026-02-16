import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
import routes from './routes/index.js';
import { startReplyWorker } from './workers/replyWorker.js';

dotenv.config();

connectDB();

const app = express();

// --- DEBUGGING MIDDLEWARE ---
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    console.log(`   Content-Type: ${req.headers['content-type']}`);
    next();
});

// --- CORS Configuration ---
app.use(cors({
    origin: ["http://localhost:5173", "http://localhost:5174","https://admin.respondpilotpro.com", "https://www.respondpilotpro.com", "https://respondpilotpro.com"], // Frontend URL
    credentials: true
}));

// Serve Uploads Folder
app.use('/uploads', express.static('uploads'));

// --- BODY PARSERS (THE FIX) ---

// 1. JSON Parser (Webhook ko exclude karne ka sahi tareeqa)
app.use((req, res, next) => {
    if (req.originalUrl.includes('/api/subscription/webhook')) {
        // Stripe Webhook ke liye raw body chahiye, isliye JSON parse skip karein
        next();
    } else {
        // Baaki tamam routes ke liye JSON parse karein
        express.json()(req, res, next);
    }
});

// 2. URL Encoded Parser (Alag se lagayen)
app.use(express.urlencoded({ extended: true }));

// 3. Cookie Parser
app.use(cookieParser());

// 4. Safety: Ensure req.body exists (fixes infinite loop or crash if body parser skipped)
app.use((req, res, next) => {
    if (!req.body) req.body = {};
    next();
});

// --- LOGGING ---
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// --- ROUTES ---
app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api', routes);

// --- ERROR HANDLING ---
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    
    // Yahan worker start karein. Server up hone ke baad.
    console.log("🛠️ Initializing Background Worker...");
    startReplyWorker(); 
});
