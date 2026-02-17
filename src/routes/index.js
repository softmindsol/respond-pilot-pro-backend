import express from 'express';
import authRoutes from './auth.routes.js';
import youtubeRoutes from './youtube.routes.js';
import aiRoutes from './ai.routes.js';
import subscriptionRoutes from './subscription.routes.js';
import adminRoutes from './admin.routes.js';
import userRouter from './user.routes.js'
import notificationRoutes from './notification.routes.js';
const router = express.Router();

router.use('/auth', authRoutes);
router.use('/youtube', youtubeRoutes);
router.use('/ai', aiRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/admin', adminRoutes);
router.use('/user',userRouter)
router.use('/notifications', notificationRoutes);

export default router;
