import Stripe from 'stripe';
import User from '../models/user.model.js';
import Commission from '../models/commission.model.js'; // Import Commission Model
import Transaction from '../models/transaction.model.js';

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
    // Case insensitive match
    const normalizedPlanType = Object.keys(PLAN_PRICES).find(key => key.toLowerCase() === planType.toLowerCase());

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

const processAffiliateCommission = async (session) => {
    const customerEmail = session.customer_details?.email;
    const amountPaid = session.amount_total / 100; // Cents to Dollars
    
    if (!customerEmail || amountPaid <= 0) return;

    console.log(`Checking commission for: ${customerEmail}`);

    const user = await User.findOne({ email: customerEmail });
    if (!user || !user.referredBy) return;

    const referrer = await User.findById(user.referredBy);
    if (referrer && referrer.affiliateTier !== 'none') {
        
        let rate = referrer.affiliateTier === 'tier1' ? 0.30 : 0.15;
        const commissionEarned = parseFloat((amountPaid * rate).toFixed(2));

        console.log(`💰 Commission Triggered: $${commissionEarned} for ${referrer.email}`);

        // Update Wallet
        await User.findByIdAndUpdate(referrer._id, {
            $inc: { walletBalance: commissionEarned, totalEarnings: commissionEarned }
        });

        // Record History
        await Commission.create({
            affiliateId: referrer._id,
            referredUserId: user._id,
            orderAmount: amountPaid,
            commissionAmount: commissionEarned,
            commissionRate: rate * 100,
            tier: referrer.affiliateTier,
            stripePaymentId: session.payment_intent,
            status: 'pending'
        });
    }
};

// 🔥 MAIN WEBHOOK HANDLER
export const handleWebhook = async (event) => {
    if (!stripe) return;

    switch (event.type) {
        // One-Time Payment Success Event
        case 'checkout.session.completed':
            const session = event.data.object;
            
            // 1. Give Credits to User
            await handleCheckoutCompleted(session);
            
            // 2. Give Commission to Referrer
            await processAffiliateCommission(session);
            break;
    }
};

const handleCheckoutCompleted = async (session) => {
    const userId = session.metadata.userId;
    const planType = session.metadata.planType;
    const amountTotal = session.amount_total / 100; // Convert cents to dollars

    const user = await User.findById(userId);
    if (!user) return;

    const creditsToAdd = PLAN_CREDITS[planType] || 0;

    if (creditsToAdd > 0) {
        if (planType !== 'TOP_UP') {
            user.plan = planType;
            user.repliesUsed = 0;
            user.repliesLimit = creditsToAdd;

            // 🔥 Auto-enable Crisis Detection for Pro Plus
            if (planType === 'PRO_PLUS') {
                 if (!user.notificationSettings) user.notificationSettings = {};
                 user.notificationSettings.aiCrisisDetection = true;
            }
        } else {
            user.repliesLimit = (user.repliesLimit || 0) + creditsToAdd;
        }
        user.subscriptionStatus = 'active'; // or whatever you track
        await user.save();
    }

      await Transaction.create({
        userId: user._id,
        stripeSessionId: session.id,
        amount: amountTotal,
        planType: planType,
        status: session.payment_status === 'paid' ? 'completed' : 'failed',
        paymentMethod: session.payment_method_types ? session.payment_method_types[0] : 'card'
    });
};



export default {
    createCheckoutSession,
    createCustomerPortalSession,
    handleWebhook
};
