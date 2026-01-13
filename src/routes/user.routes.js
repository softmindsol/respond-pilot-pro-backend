
import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import { joinAffiliateProgram } from '../controllers/user.controller.js';

const router = express.Router();

router.post('/join-affiliate', protect, joinAffiliateProgram);


export default router;
