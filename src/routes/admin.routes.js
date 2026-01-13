import express from 'express';
import { protect, admin } from '../middleware/auth.middleware.js';
import { getAllUsers, updateUserTier } from '../controllers/admin.controller.js';

const router = express.Router();

// Middleware 'admin' zaroori hai taake har koi access na kare
router.get('/users', protect, admin, getAllUsers);
router.put('/update-tier', protect, admin, updateUserTier);

export default router;