
import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { joinAffiliateProgram, updateSettings, getNotifications, markNotificationRead, markAllNotificationsRead, completeOnboarding } from '../controllers/user.controller.js';

const router = express.Router();

router.post('/join-affiliate', protect, joinAffiliateProgram);
router.put('/settings', protect, updateSettings);
router.post('/complete-onboarding', protect, completeOnboarding);

router.get('/notifications', protect, getNotifications);
router.put('/notifications/read-all', protect, markAllNotificationsRead);
router.put('/notifications/:id/read', protect, markNotificationRead);


export default router;
