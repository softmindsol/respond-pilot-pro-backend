import express from 'express';
import { registerUser, loginUser, googleAuth, forgotPassword, verifyOtp, resetPassword, verifyEmailOtp, resendVerificationOtp, getProfile, updateToneSettings } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmailOtp);
router.post('/resend-verification', resendVerificationOtp);
router.get('/profile', protect, getProfile);
router.put('/update-tone-settings', protect, updateToneSettings);

export default router;
