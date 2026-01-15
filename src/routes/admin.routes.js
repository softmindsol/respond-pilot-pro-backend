import express from 'express';
import { protect, admin } from '../middleware/auth.middleware.js';
import { getAllUsers, getPaymentStats, getPendingPayouts, getTransactions, processPayout, updateUserTier } from '../controllers/admin.controller.js';

const router = express.Router();

// Middleware 'admin' zaroori hai taake har koi access na kare
router.get('/users', protect, admin, getAllUsers);
router.put('/update-tier', protect, admin, updateUserTier);
router.get('/payouts', protect, admin, getPendingPayouts);
router.post('/payout-confirm', protect, admin, processPayout);
router.get('/transactions', protect, admin, getTransactions);
router.get('/payment-stats', protect, admin, getPaymentStats);

export default router;