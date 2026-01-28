import express from 'express';
import { protect } from '../middleware/auth.middleware.js'; // Adjust path if needed
import youtubeController from '../controllers/youtube.controller.js';
import { checkSubscription } from '../middleware/subscription.middleware.js';

const router = express.Router();

router.get('/auth-url', protect, youtubeController.getAuthUrl);
router.get('/videos', protect, youtubeController.getVideos);
router.get('/callback', youtubeController.googleCallback);
router.get('/comments', protect, youtubeController.getComments);
router.post('/reply', protect,checkSubscription, youtubeController.postReply);
router.post('/disconnect', protect, youtubeController.disconnectChannel);

export default router;
