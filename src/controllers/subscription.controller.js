import subscriptionService from '../services/subscription.service.js';
import Stripe from 'stripe';

const createSession = async (req, res) => {
    try {
        const { planType } = req.body; // 'Basic', 'Pro', 'ProPlus', 'TopUp'
        const user = req.user;

        if (!planType) {
            return res.status(400).json({ message: 'Plan Type is required' });
        }

        const session = await subscriptionService.createCheckoutSession(user, planType);

        if (!session) {
            // Handle Free plan or other logic
            return res.status(400).json({ message: 'This plan does not require checkout' });
        }

        res.json({ url: session.url });

    } catch (error) {
        console.error("Subscription Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error("WEBHOOK ERROR: STRIPE_WEBHOOK_SECRET not set.");
        return res.status(400).send("Webhook Secret Missing");
    }

    try {
        // Stripe expects raw body
        // Ensure your index.js parsing middleware handles raw for this route
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook Signature Verification Failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle event in service
    await subscriptionService.handleWebhook(event);

    res.json({ received: true });
};

export default {
    createSession,
    handleWebhook
};
