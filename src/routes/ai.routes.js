import express from 'express';
import aiController from '../controllers/ai.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/generate-reply', protect, aiController.generateReply);

export default router;
