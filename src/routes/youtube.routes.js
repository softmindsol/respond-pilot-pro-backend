import express from 'express';
import { protect } from '../middleware/auth.middleware.js'; // Adjust path if needed
import youtubeController from '../controllers/youtube.controller.js';
import { checkSubscription } from '../middleware/subscription.middleware.js';
import { syncLimiter } from '../middleware/rateLimit.middleware.js';


const router = express.Router();

router.get('/auth-url', protect, youtubeController.getAuthUrl);
router.get('/videos', protect, youtubeController.getVideos);
router.get('/callback', youtubeController.googleCallback);
router.get('/comments', protect, youtubeController.getComments);
router.post('/reply', protect,checkSubscription, youtubeController.postReply);
router.post('/disconnect', protect, youtubeController.disconnectChannel);
router.get('/comments/sync', protect, syncLimiter, youtubeController.getSyncedComments);
// 🔥 Post all safe drafts to background queue
router.post('/queue-bulk', protect, youtubeController.queueBulkReplies);

// 🔥 Check how many replies are posted/pending
router.get('/queue-progress', protect, youtubeController.getQueueProgress);
export default router;
