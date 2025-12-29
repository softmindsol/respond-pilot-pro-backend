import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import subscriptionController from '../controllers/subscription.controller.js';

const router = express.Router();

// Public webhook route (Stripe calls this)
// NOTE: Use express.raw({type: 'application/json'}) in app.js for this specific route if possible
router.post('/webhook', express.raw({ type: 'application/json' }), subscriptionController.handleWebhook);

// Protected routes
router.post('/create-checkout-session', protect, subscriptionController.createSession);
router.post('/create-portal-session', protect, subscriptionController.createCustomerPortal);

export default router;
