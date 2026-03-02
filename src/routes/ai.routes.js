import express from 'express';
import aiController from '../controllers/ai.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { checkSubscription } from '../middleware/subscription.middleware.js';

const router = express.Router();

router.post('/generate-reply', protect,checkSubscription, aiController.generateReply);
router.post('/track-reply', protect, aiController.trackExtensionReply);

export default router;
