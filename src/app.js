import express from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';
// We will create this file next, but importing it now is fine as long as we create it before running.
import routes from './routes/index.js';

dotenv.config();

connectDB();

const app = express();

// Webhook route needs RAW body, so skip JSON parsing for it
app.use((req, res, next) => {
    if (req.originalUrl === '/api/subscription/webhook') {
        next();
    } else {
        express.json()(req, res, next);
    }
});
app.use(cookieParser());
// app.use(cors());

app.use(cors({
    origin: "http://localhost:5173", // Apne Frontend ka URL likhein
    credentials: true // Agar cookies use kar rahe hain
}));

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.use('/api', routes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
