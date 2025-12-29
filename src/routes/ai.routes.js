import express from 'express';
import aiController from '../controllers/ai.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/generate-reply', protect, aiController.generateReplyStream);
// router.post('/generate-article-stream', protect, aiController.generateArticleWithAIStream); // Removed as we replaced the controller logic

export default router;
