import express from 'express';
import authRoutes from './auth.routes.js';
import youtubeRoutes from './youtube.routes.js';
import aiRoutes from './ai.routes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/youtube', youtubeRoutes);
router.use('/ai', aiRoutes);

export default router;
