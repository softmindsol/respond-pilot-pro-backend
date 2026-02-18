import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {subscribeUser, unsubscribeUser} from '../controllers/notification.controller.js';

const router = express.Router();

router.post('/subscribe', protect, subscribeUser);
router.post('/unsubscribe', protect, unsubscribeUser);

export default router;
