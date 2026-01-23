import User from '../models/user.model.js';

// Plan Limits (Fallback ke liye, agar DB mein limit set na ho)
const PLAN_LIMITS = {
    'Free': 50,
    'Basic': 1000,
    'Pro': 5000,
    'Pro Plus': 15000
};

export const checkSubscription = async (req, res, next) => {
    try {
        // 'protect' middleware se user already req.user mein hai
        const user = req.user;

        if (!user) {
            return res.status(401).json({ message: "User not authenticated" });
        }

        const used = user.repliesUsed || 0;

        // ======================================================
        // 1. FOUNDING PARTNER (TIER 1) - VIP PASS
        // ======================================================
        // Agar user Tier 1 hai, to usay kisi limit ya payment ki zaroorat nahi.
        if (user.affiliateTier === 'tier1') {
            console.log(`✨ Founding Partner Access: ${user.email}`);
            const VIP_LIMIT = 5000;
            
            if (used >= VIP_LIMIT) {
                return res.status(403).json({ 
                    message: "Founding Partner limit (5,000) reached. Please buy a Top-Up.",
                    reason: "limit_exceeded",
                    usage: { used, limit: VIP_LIMIT }
                });
            }
            return next(); 
        }

 
        // Agar Plan 'Free' NAHI hai, to make sure karein ke subscription active hai.
        if (user.plan !== 'Free') {
            const validStatuses = ['active', 'trialing'];
                       // Note: stripeSubscriptionStatus field Stripe Webhook se update hoti hai
            if (!user.subscriptionStatus || !validStatuses.includes(user.subscriptionStatus)) {
                return res.status(403).json({ 
                    message: "Your subscription is inactive or payment failed. Please update payment details.",
                    reason: "inactive_subscription"
                });
            }
        }

        
        // Current usage
        // const used = user.repliesUsed || 0;

        // Current Limit:
        // Hum DB field 'repliesLimit' use karenge (taake Top-Ups bhi count hon).
        // Agar DB mein field missing hai, to hardcoded Plan Limit use karenge.
        const limit = user.repliesLimit || PLAN_LIMITS[user.plan] || 50;

        if (used >= limit) {
            return res.status(403).json({ 
                message: "You have reached your reply limit.",
                reason: "limit_exceeded",
                currentPlan: user.plan,
                usage: { used, limit }
            });
        }

        // Agar sab theek hai, to aage barho
        next();

    } catch (error) {
        console.error("Subscription Check Error:", error);
        res.status(500).json({ message: "Server error during subscription check." });
    }
};