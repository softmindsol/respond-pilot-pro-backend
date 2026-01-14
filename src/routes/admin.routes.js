import express from 'express';
import { protect, admin } from '../middleware/auth.middleware.js';
import { getAllUsers, getPendingPayouts, processPayout, updateUserTier } from '../controllers/admin.controller.js';

const router = express.Router();

// Middleware 'admin' zaroori hai taake har koi access na kare
router.get('/users', protect, admin, getAllUsers);
router.put('/update-tier', protect, admin, updateUserTier);
router.get('/payouts', protect, admin, getPendingPayouts);
router.post('/payout-confirm', protect, admin, processPayout);
export default router;