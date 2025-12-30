import Stripe from 'stripe';
import User from '../models/user.model.js';

// Initialize Stripe 
let stripe;
if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Map Plans to Credits (One-Time)
const PLAN_CREDITS = {
    'Basic': 1000,
    'Pro': 5000,
    'PRO_PLUS': 15000,
    'TOP_UP': 500
};

// Map Plans to Price IDs
const PLAN_PRICES = {
    'Basic': process.env.STRIPE_PRICE_BASIC,
    'Pro': process.env.STRIPE_PRICE_PRO,
    'PRO_PLUS': process.env.STRIPE_PRICE_PRO_PLUS,
    'TOP_UP': process.env.STRIPE_PRICE_TOP_UP,
};

// 1. Create Checkout Session
export const createCheckoutSession = async (user, planType) => {
    if (!stripe) throw new Error("Stripe is not configured set STRIPE_SECRET_KEY");
    console.log("planType:", planType)
    // Case insensitive match
    const normalizedPlanType = Object.keys(PLAN_PRICES).find(key => key.toLowerCase() === planType.toLowerCase());

    console.log("normalizedPlanType:", normalizedPlanType)
    // Free is automatic
    if (planType.toLowerCase() === 'free') {
        return null;
    }

    if (!normalizedPlanType) {
        throw new Error(`Invalid plan type: ${planType}. Valid options are Basic, Pro, pro_plus, TopUp.`);
    }

    const priceId = PLAN_PRICES[normalizedPlanType];
    if (!priceId) {
        throw new Error(`Price ID missing for ${normalizedPlanType}. Check .env`);
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: { userId: user._id.toString() }
        });
        customerId = customer.id;
        user.stripeCustomerId = customerId;
        await user.save();
    }

    // Always ONE-TIME payment now
    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [
            {
                price: priceId,
                quantity: 1,
            },
        ],
        mode: 'payment', // Changed from subscription to payment
        success_url: `${process.env.CLIENT_URL}/dashboard?checkout_success=true&plan=${normalizedPlanType}`,
        cancel_url: `${process.env.CLIENT_URL}/pricing?canceled=true`,
        metadata: {
            userId: user._id.toString(),
            planType: normalizedPlanType
        }
    });

    return session;
};

// 2. Portal Session (Still useful for update card / invoice history, but maybe less for swapping subs now)
export const createCustomerPortalSession = async (user) => {
    if (!stripe) throw new Error("Stripe is not configured");
    if (!user.stripeCustomerId) throw new Error('User does not have a billing account yet.');

    const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${process.env.CLIENT_URL}/dashboard`,
    });

    return session;
};

// 3. Handle Webhook
export const handleWebhook = async (event) => {
    if (!stripe) return;

    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutCompleted(event.data.object);
            break;
        // recurring events removed since it's one-time
    }
};

const handleCheckoutCompleted = async (session) => {
    const userId = session.metadata.userId;
    const planType = session.metadata.planType; // e.g. 'Basic', 'Pro'

    const user = await User.findById(userId);
    if (!user) return;

    // Credits to add
    const creditsToAdd = PLAN_CREDITS[planType] || 0;

    if (creditsToAdd > 0) {
        // If it's a main PLAN (Basic, Pro, etc), reset usage to GIVE FRESH START.
        // And Set Limit to that plan's limit (wipe old limit).
        if (planType !== 'TOP_UP') {
            user.plan = planType;
            user.repliesUsed = 0; // RESET USAGE
            user.repliesLimit = creditsToAdd; // SET NEW LIMIT
        } else {
            // TopUp: Just ADD credits. Dont reset usage history.
            user.repliesLimit = (user.repliesLimit || 0) + creditsToAdd;
        }

        user.subscriptionStatus = 'active';
    }

    await user.save();
};

export default {
    createCheckoutSession,
    createCustomerPortalSession,
    handleWebhook
};
