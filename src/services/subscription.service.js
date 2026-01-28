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
    if (!stripe) throw new Error("Stripe is not configured");

    const normalizedPlanType = Object.keys(PLAN_PRICES).find(key => key.toLowerCase() === planType.toLowerCase());
    if (planType.toLowerCase() === 'free') return null;
    if (!normalizedPlanType) throw new Error(`Invalid plan type`);
    
    const priceId = PLAN_PRICES[normalizedPlanType];
    if (!priceId) throw new Error(`Price ID missing`);

    // Helper to create customer
    const createNewCustomer = async () => {
        const customer = await stripe.customers.create({
            email: user.email,
            name: user.name,
            metadata: { userId: user._id.toString() }
        });
        user.stripeCustomerId = customer.id;
        await user.save();
        console.log(`✅ New Stripe Customer Created: ${customer.id}`);
        return customer.id;
    };

    let customerId = user.stripeCustomerId;
    if (!customerId) {
        customerId = await createNewCustomer();
    }

    // 🔥 LOGIC: Top-Up is 'payment', Plans are 'subscription'
    const isTopUp = normalizedPlanType === 'TOP_UP';
    const sessionMode = isTopUp ? 'payment' : 'subscription';

    const sessionParams = {
        line_items: [{ price: priceId, quantity: 1 }],
        mode: sessionMode, 
        success_url: `${process.env.CLIENT_URL}/dashboard?checkout_success=true&plan=${normalizedPlanType}`,
        cancel_url: `${process.env.CLIENT_URL}/pricing?canceled=true`,
        metadata: {
            userId: user._id.toString(),
            planType: normalizedPlanType,
            referrerId: user.referredBy ? user.referredBy.toString() : null 
        }
    };

    try {
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            ...sessionParams
        });
        return session;
    } catch (error) {
        // Handle "No such customer" error (Local DB has ID that Stripe doesn't know)
        if (error.code === 'resource_missing' || (error.message && error.message.includes('No such customer'))) {
            console.log("⚠️ Stripe Customer not found (invalid ID). Creating new one...");
            customerId = await createNewCustomer();
            
            // Retry with new customer ID
            const session = await stripe.checkout.sessions.create({
                customer: customerId,
                ...sessionParams
            });
            return session;
        }
        throw error;
    }
};

// 2. Portal Session (Still useful for update card / invoice history)
export const createCustomerPortalSession = async (user) => {
    if (!stripe) throw new Error("Stripe is not configured");
    if (!user.stripeCustomerId) throw new Error('User does not have a billing account yet.');

    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.CLIENT_URL}/dashboard`,
        });
        return session;
    } catch (error) {
        if (error.code === 'resource_missing' || (error.message && error.message.includes('No such customer'))) {
            console.log("⚠️ Stripe Customer ID is invalid. Resetting user record.");
            user.stripeCustomerId = null;
            await user.save();
            throw new Error('Billing account mismatch. Please try subscribing again.');
        }
        throw error;
    }
};

// const processAffiliateCommission = async (session) => {
//     const customerEmail = session.customer_details?.email;
//     const amountPaid = session.amount_total / 100; // Cents to Dollars
    
//     if (!customerEmail || amountPaid <= 0) return;

//     console.log(`Checking commission for: ${customerEmail}`);

//     const user = await User.findOne({ email: customerEmail });
//     if (!user || !user.referredBy) return;

//     const referrer = await User.findById(user.referredBy);
//     if (referrer && referrer.affiliateTier !== 'none') {
        
//         let rate = referrer.affiliateTier === 'tier1' ? 0.30 : 0.15;
//         const commissionEarned = parseFloat((amountPaid * rate).toFixed(2));

//         console.log(`💰 Commission Triggered: $${commissionEarned} for ${referrer.email}`);

//         // Update Wallet
//         await User.findByIdAndUpdate(referrer._id, {
//             $inc: { walletBalance: commissionEarned, totalEarnings: commissionEarned }
//         });

//         // Record History
//         await Commission.create({
//             affiliateId: referrer._id,
//             referredUserId: user._id,
//             orderAmount: amountPaid,
//             commissionAmount: commissionEarned,
//             commissionRate: rate * 100,
//             tier: referrer.affiliateTier,
//             stripePaymentId: session.payment_intent,
//             status: 'pending'
//         });
//     }
// };

const processCommission = async (email, amountInDollars, paymentId) => {
    if (!email || amountInDollars <= 0) return;

    try {
        const user = await User.findOne({ email });
        // Agar user nahi mila ya referrer nahi hai, to wapis jao (Crash mat karo)
        if (!user || !user.referredBy) return;

        const referrer = await User.findById(user.referredBy);
        if (referrer && referrer.affiliateTier !== 'none') {
            let rate = referrer.affiliateTier === 'tier1' ? 0.30 : 0.20;
            const commissionEarned = parseFloat((amountInDollars * rate).toFixed(2));

            console.log(`💰 Commission: $${commissionEarned} for ${referrer.email}`);

            await User.findByIdAndUpdate(referrer._id, {
                $inc: { walletBalance: commissionEarned, totalEarnings: commissionEarned }
            });

            await Commission.create({
                affiliateId: referrer._id,
                referredUserId: user._id,
                orderAmount: amountInDollars,
                commissionAmount: commissionEarned,
                commissionRate: rate * 100,
                tier: referrer.affiliateTier,
                // Stripe payment ID safe check
                stripePaymentId: paymentId || "unknown_id",
                status: 'pending'
            });
        }
    } catch (e) {
        console.error("Commission Logic Error:", e.message);
        // Error ko swallow karein taake webhook 200 hi return kare
    }
};

export const handleWebhook = async (event) => {
    if (!stripe) return;

    try {
        switch (event.type) {
            
            // 1. One-Time Payment (Top-Up) or First Sub Payment
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleCheckoutCompleted(session);

                // Only for Top-Ups (One Time)
                if (session.mode === 'payment') {
                    const amount = session.amount_total / 100;
                    await processCommission(session.customer_details?.email, amount, session.id);
                }
                break;

            // 2. Recurring Payment (Subscription Cycle)
            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                
                // Ensure valid billing reason
                if (invoice.billing_reason === 'subscription_create' || invoice.billing_reason === 'subscription_cycle') {
                    
                    // A. Commission
                    const amount = invoice.amount_paid / 100;
                    // Invoice ID ko fallback use karein agar payment_intent null ho
                    const paymentId = invoice.payment_intent || invoice.id;
                    
                    await processCommission(invoice.customer_email, amount, paymentId);

                    // B. Quota Reset (Renewal Only)
                    if (invoice.billing_reason === 'subscription_cycle') {
                        await handleSubscriptionRenewal(invoice);
                    }
                }
                break;
        }
    } catch (err) {
        console.error("🔥 Webhook Logic Crash:", err);
        // Important: Error ko catch karke log karein, lekin throw na karein
        // taake Stripe ko 200 OK mile aur wo retry na karta rahe.
    }
};

// Helper: Handle Plan Updates / Top-Ups
const handleCheckoutCompleted = async (session) => {
    const userId = session.metadata.userId;
    const planType = session.metadata.planType;
    const amountTotal = session.amount_total / 100;

    const user = await User.findById(userId);
    if (!user) return;

    const creditsToAdd = PLAN_CREDITS[planType] || 0;

    if (creditsToAdd > 0) {
        // 🔥 LOGIC: Top-Up vs Subscription
        if (planType === 'TOP_UP') {
            // Top-Up: Sirf Credits ADD karo (Reset mat karo)
            user.repliesLimit = (user.repliesLimit || 0) + creditsToAdd;
        } else {
            // Subscription: Plan change karo aur Reset karo
            user.plan = planType;
            user.repliesUsed = 0; // Reset usage
            user.repliesLimit = creditsToAdd; // Set new limit

            // Pro Plus Auto-Enable
            if (planType === 'PRO_PLUS' || planType === 'Pro Plus') {
                 if (!user.notificationSettings) user.notificationSettings = {};
                 user.notificationSettings.aiCrisisDetection = true;
            }
        }
        user.subscriptionStatus = 'active';
        await user.save();
    }

    // Save Transaction
    await Transaction.create({
        userId: user._id,
        stripeSessionId: session.id,
        amount: amountTotal,
        planType: planType,
        status: session.payment_status === 'paid' ? 'completed' : 'failed',
        paymentMethod: session.payment_method_types ? session.payment_method_types[0] : 'card'
    });
};

const handleSubscriptionRenewal = async (invoice) => {
    const user = await User.findOne({ email: invoice.customer_email });
    if (!user) return;

    console.log(`🔄 Monthly Renewal: Processing for ${user.email}`);

    // 1. Get Base Plan Limit (e.g., Basic = 1000)
    // Note: Ensure PLAN_CREDITS is accessible here or re-defined
    const PLAN_CREDITS = {
        'Basic': 1000,
        'Pro': 5000,
        'PRO_PLUS': 15000,
        'Pro Plus': 15000, // Safe casing
        'TOP_UP': 500
    };

    const basePlanLimit = PLAN_CREDITS[user.plan] || 0;
    const currentLimit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    // 2. Calculate Remaining Top-Up
    let remainingTopUp = 0;

    // Agar Current Limit > Base Plan hai, iska matlab User ke paas Top-Up tha
    if (currentLimit > basePlanLimit) {
        
        // Total Top-Up jo user ke paas tha
        const totalTopUpOwned = currentLimit - basePlanLimit;
        
        // Check karein ke usne Top-Up mein se kitna use kiya?
        // Logic: Pehle Plan ke credits use hotay hain, phir Top-Up ke.
        
        const usageFromTopUp = Math.max(0, used - basePlanLimit); 
        // Example: Agar 1200 use kiye aur Plan 1000 ka tha, to 200 Top-Up se gaye.
        
        remainingTopUp = Math.max(0, totalTopUpOwned - usageFromTopUp);
        // Example: Total Top-Up 500 tha, 200 use hua, to 300 bacha.
    }

    console.log(`📊 Renewal Math: Base: ${basePlanLimit}, Prev Top-Up Left: ${remainingTopUp}`);

    // 3. Apply New Limit (New Month Plan + Old Remaining Top-Up)
    user.repliesUsed = 0; // Usage reset (New Month)
    user.repliesLimit = basePlanLimit + remainingTopUp; // Limit = Plan + Carry Over

    await user.save();
    console.log(`✅ Subscription Renewed. New Limit: ${user.repliesLimit}`);
};



export default {
    createCheckoutSession,
    createCustomerPortalSession,
    handleWebhook
};
