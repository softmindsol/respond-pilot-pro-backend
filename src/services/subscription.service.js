import Stripe from 'stripe';
import User from '../models/user.model.js';

// Initialize Stripe (Lazily or here if env is ready, handle missing key gracefully)
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Map your Frontend Plans to Stripe Price IDs (You MUST set these in .env)
const PLAN_PRICES = {
    'Basic': process.env.STRIPE_PRICE_BASIC,
    'Pro': process.env.STRIPE_PRICE_PRO,
    'ProPlus': process.env.STRIPE_PRICE_PRO_PLUS,
    'TopUp': process.env.STRIPE_PRICE_TOP_UP, // One-time payment
    // 'Free': No payment needed
};

// 1. Create Checkout Session
export const createCheckoutSession = async (user, planType) => {
    if (!stripe) throw new Error("Stripe is not configured set STRIPE_SECRET_KEY");

    const priceId = PLAN_PRICES[planType];
    if (!priceId && planType !== 'Free') {
        throw new Error(`Invalid plan type: ${planType} or Price ID missing in .env`);
    }

    if (planType === 'Free') {
        // Just downgrade directly? Or maybe checkout not needed.
        // Usually, downgrading to free is an immediate action, not a checkout.
        return null;
    }

    // Determine Mode
    const mode = planType === 'TopUp' ? 'payment' : 'subscription';

    // Get or Create Stripe Customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: { userId: user._id.toString() }
        });
        customerId = customer.id;

        // Save to DB immediately
        user.stripeCustomerId = customerId;
        await user.save();
    }

    // Create Session
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: mode,
        success_url: `${process.env.CLIENT_URL}/dashboard?checkout_success=true&plan=${planType}`,
        cancel_url: `${process.env.CLIENT_URL}/pricing?canceled=true`,
        metadata: {
            userId: user._id.toString(),
            planType: planType
        }
    });

    return session;
};

// 2. Handle Webhook Events
export const handleWebhook = async (event) => {
    if (!stripe) return;

    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutCompleted(event.data.object);
            break;
        case 'invoice.payment_succeeded':
            // Subscription renewed
            await handleInvoicePaymentSucceeded(event.data.object);
            break;
        case 'invoice.payment_failed':
            // Handle failed payment
            await handleInvoicePaymentFailed(event.data.object);
            break;
        case 'customer.subscription.deleted':
            // Subscription cancelled/expired
            await handleSubscriptionDeleted(event.data.object);
            break;
    }
};

// --- Helpers ---

const handleCheckoutCompleted = async (session) => {
    const userId = session.metadata.userId;
    const planType = session.metadata.planType;
    const subscriptionId = session.subscription; // Exists if mode='subscription'

    const user = await User.findById(userId);
    if (!user) return;

    if (planType === 'TopUp') {
        // One-time payment: Add 500 replies
        user.repliesUsed = Math.max(0, user.repliesUsed - 500); // Or use a separate 'credits' logic? 
        // User asked: "Top up me 500" - Likely means ADD 500 quota or Reset count?
        // Let's assume TopUp gives extra capacity. But current logic is "repliesUsed vs Limit".
        // A better way for TopUp is: "Limit = Limit + 500". But our limit is hardcoded by Plan.
        // Alternative: Reduce 'repliesUsed' by 500 so they have more room.
        user.repliesUsed = Math.max(0, (user.repliesUsed || 0) - 500);
    } else {
        // Change Plan
        user.plan = planType;
        user.stripeSubscriptionId = subscriptionId;
        user.subscriptionStatus = 'active';
        user.repliesUsed = 0; // Reset usage on new plan?

        // Calculate expiry if needed, but Stripe manages recursion.
    }

    await user.save();
};

const handleInvoicePaymentSucceeded = async (invoice) => {
    // This runs on monthly renewal
    const subscriptionId = invoice.subscription;
    const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
    if (user) {
        user.repliesUsed = 0; // Reset monthly usage
        user.subscriptionStatus = 'active';
        await user.save();
    }
};

const handleInvoicePaymentFailed = async (invoice) => {
    const subscriptionId = invoice.subscription;
    const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
    if (user) {
        user.subscriptionStatus = 'past_due';
        await user.save();
    }
};

const handleSubscriptionDeleted = async (subscription) => {
    const user = await User.findOne({ stripeSubscriptionId: subscription.id });
    if (user) {
        user.plan = 'Free'; // Downgrade
        user.subscriptionStatus = 'canceled';
        user.stripeSubscriptionId = null;
        await user.save();
    }
};

export default {
    createCheckoutSession,
    handleWebhook
};
