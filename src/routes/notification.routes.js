import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import {subscribeUser} from '../controllers/notification.controller.js';

const router = express.Router();

router.post('/subscribe', protect, subscribeUser);

export default router;
