import express from 'express';
import { protect } from '../middleware/auth.middleware.js'; // Adjust path if needed
import youtubeController from '../controllers/youtube.controller.js';

const router = express.Router();

// Protected: User must be logged in to ask for the connection URL
router.get('/auth-url', protect, youtubeController.getAuthUrl);

// Public: Google calls this. We validate the user via the 'state' param.
router.get('/callback', youtubeController.googleCallback);
router.get('/comments', protect, youtubeController.getComments);

export default router;