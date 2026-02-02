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


    if (user.stripeSubscriptionId && normalizedPlanType !== 'TOP_UP') {
        console.log("🔄 User already subscribed. Redirecting to Portal for Swap.");

        // Portal session create karein jahan user direct 'Change Plan' kar sake
        return await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.CLIENT_URL}/dashboard`,
            // Optional: Agar aap direct user ko upgrade page par bhejna chahte hain
            flow_data: {
                type: 'subscription_update',
                subscription_update: {
                    subscription: user.stripeSubscriptionId,
                },
            },
        });
    }


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
    console.log(`Creating Session for User: ${user._id}, Plan: ${normalizedPlanType}`);

    const sessionParams = {
        line_items: [{ price: priceId, quantity: 1 }],
        mode: sessionMode,
        success_url: `${process.env.CLIENT_URL}/dashboard?checkout_success=true&plan=${normalizedPlanType}`,
        cancel_url: `${process.env.CLIENT_URL}/pricing?canceled=true`,
        metadata: {
            userId: user._id.toString(),
            planType: normalizedPlanType,
            youtubeChannelId: user.youtubeChannelId,
            referrerId: user.referredBy ? user.referredBy.toString() : null
        }
    };

    console.log("📤 Sending Metadata to Stripe:", sessionParams.metadata);

    // 🔥 Recurring plans ke liye subscription_data mein bhi metadata dalna zaroori hai
    if (sessionMode === 'subscription') {
        sessionParams.subscription_data = {
            metadata: {
                youtubeChannelId: user.youtubeChannelId,
                userId: user._id.toString()
            }
        };
    }

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
        console.log(`🔔 Webhook Received: ${event.type}`);

        switch (event.type) {

            // 1. One-Time Payment (Top-Up) or First Sub Payment
            case 'checkout.session.completed':
                console.log("   -> Processing Checkout Session...");

                const session = event.data.object;
                await handleCheckoutCompleted(session);

                // Only for Top-Ups (One Time)
                if (session.mode === 'payment') {
                    const amount = session.amount_total / 100;
                    await processCommission(session.customer_details?.email, amount, session.id);
                }
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            // 🔥 NEW CASE: Plan Swap/Update
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            // 2. Recurring Payment (Subscription Cycle)
            case 'invoice.payment_succeeded':
                console.log("   -> Processing Invoice Payment...");

                const invoice = event.data.object;

                // Ensure valid billing reason
                if (invoice.billing_reason === 'subscription_create' || invoice.billing_reason === 'subscription_cycle') {

                    // A. Commission
                    const amount = invoice.amount_paid / 100;
                    // Invoice ID ko fallback use karein agar payment_intent null ho
                    const paymentId = invoice.payment_intent || invoice.id;

                    await processCommission(invoice.customer_email, amount, paymentId);

                    // B. Quota Reset (Renewal Only)
                    // if (invoice.billing_reason === 'subscription_cycle') {
                    //     await handleSubscriptionRenewal(invoice);
                    // }
                    // 🔥 CHANNEL-CENTRIC RENEWAL
                    if (invoice.billing_reason === 'subscription_cycle') {
                        await handleSubscriptionRenewal(invoice);
                    }

                }
                break;
        }
    } catch (err) {
        console.error("🔥 Webhook Logic Crash:", err);
   
    }
};

// Helper: Handle Plan Updates / Top-Ups
const handleCheckoutCompleted = async (session) => {
    console.log("👉 handleCheckoutCompleted Started...");

    const userId = session.metadata.userId;
    const planType = session.metadata.planType;
    const amountTotal = session.amount_total / 100;
    console.log(`   - Data: UserID=${userId}, Plan=${planType}, Amount=$${amountTotal}`);

    const user = await User.findById(userId);
    if (!user) return;

    // 🔥 SAVE SUBSCRIPTION ID (Zaroori hai swapping ke liye)
    if (session.mode === 'subscription') {
        user.stripeSubscriptionId = session.subscription;
    }
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
        console.log("   ✅ User Updated Successfully");

    }

    // Save Transaction
    const newTxn = await Transaction.create({
        userId: user._id,
        stripeSessionId: session.id,
        amount: amountTotal,
        planType: planType,
        status: session.payment_status === 'paid' ? 'completed' : 'failed',
        paymentMethod: session.payment_method_types ? session.payment_method_types[0] : 'card'
    });
    console.log("   ✅ Transaction Saved Successfully", newTxn);
};

// const handleSubscriptionRenewal = async (invoice) => {
//     const user = await User.findOne({ email: invoice.customer_email });
//     if (!user) return;

//     console.log(`🔄 Monthly Renewal: Processing for ${user.email}`);
//     console.log("👉 handleSubscriptionRenewal Triggered");

//     // 1. Get Base Plan Limit (e.g., Basic = 1000)
//     // Note: Ensure PLAN_CREDITS is accessible here or re-defined
//     const PLAN_CREDITS = {
//         'Basic': 1000,
//         'Pro': 5000,
//         'PRO_PLUS': 15000,
//         'Pro Plus': 15000, // Safe casing
//         'TOP_UP': 500
//     };

//     const basePlanLimit = PLAN_CREDITS[user.plan] || 0;
//     const currentLimit = user.repliesLimit || 0;
//     const used = user.repliesUsed || 0;

//     // 2. Calculate Remaining Top-Up
//     let remainingTopUp = 0;

//     // Agar Current Limit > Base Plan hai, iska matlab User ke paas Top-Up tha
//     if (currentLimit > basePlanLimit) {

//         // Total Top-Up jo user ke paas tha
//         const totalTopUpOwned = currentLimit - basePlanLimit;

//         // Check karein ke usne Top-Up mein se kitna use kiya?
//         // Logic: Pehle Plan ke credits use hotay hain, phir Top-Up ke.

//         const usageFromTopUp = Math.max(0, used - basePlanLimit); 
//         // Example: Agar 1200 use kiye aur Plan 1000 ka tha, to 200 Top-Up se gaye.

//         remainingTopUp = Math.max(0, totalTopUpOwned - usageFromTopUp);
//         // Example: Total Top-Up 500 tha, 200 use hua, to 300 bacha.
//     }

//     console.log(`📊 Renewal Math: Base: ${basePlanLimit}, Prev Top-Up Left: ${remainingTopUp}`);

//     // 3. Apply New Limit (New Month Plan + Old Remaining Top-Up)
//     user.repliesUsed = 0; // Usage reset (New Month)
//     user.repliesLimit = basePlanLimit + remainingTopUp; // Limit = Plan + Carry Over

//     await user.save();
//     console.log(`✅ Subscription Renewed. New Limit: ${user.repliesLimit}`);
// };

const handleSubscriptionRenewal = async (invoice) => {
    try {
        // 1. Pehle Stripe se Subscription object mangwayen taake metadata (Channel ID) mil sakay
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const channelId = subscription.metadata.youtubeChannelId;

        if (!channelId) {
            console.log("⚠️ No Channel ID in subscription metadata, falling back to email.");
            // Fallback to email if metadata is missing
            const user = await User.findOne({ email: invoice.customer_email });
            if (!user) return;
            return await resetUserQuota(user);
        }

        // 🔥 2. CHANNEL-CENTRIC: Dhoondo ke AAJ is channel ka malik kaun hai?
        const user = await User.findOne({ youtubeChannelId: channelId });
        if (!user) {
            console.log(`❌ No user found owning channel: ${channelId}`);
            return;
        }

        await resetUserQuota(user);
    } catch (error) {
        console.error("Renewal Logic Error:", error.message);
    }
};


const handleSubscriptionUpdated = async (subscription) => {
    const customerId = subscription.customer;
    const user = await User.findOne({ stripeCustomerId: customerId });
    if (!user) return;

    // Stripe se naye plan ka Price ID nikalen
    const newPriceId = subscription.items.data[0].price.id;

    // Price ID se Plan Name match karein (Map reverse)
    const planName = Object.keys(PLAN_PRICES).find(key => PLAN_PRICES[key] === newPriceId);

    if (planName) {
        console.log(`🚀 Plan Swapped for ${user.email}: Now on ${planName}`);
        user.plan = planName;
        user.repliesLimit = PLAN_CREDITS[planName];
        // Note: Swapping par hum usually usage 0 nahi karte, 
        // kyunke user mahine ke beech mein bhi upgrade kar sakta hai.
        await user.save();
    }
};
// Sub-helper for renewal logic
const resetUserQuota = async (user) => {
    console.log(`🔄 Monthly Renewal: Resetting quota for ${user.email}`);

    const basePlanLimit = PLAN_CREDITS[user.plan] || 0;
    const currentLimit = user.repliesLimit || 0;
    const used = user.repliesUsed || 0;

    // 🔥 TOP-UP ROLLOVER LOGIC
    let remainingTopUp = 0;
    if (currentLimit > basePlanLimit) {
        const totalTopUpOwned = currentLimit - basePlanLimit;
        const usageFromTopUp = Math.max(0, used - basePlanLimit);
        remainingTopUp = Math.max(0, totalTopUpOwned - usageFromTopUp);
    }

    user.repliesUsed = 0;
    user.repliesLimit = basePlanLimit + remainingTopUp;
    await user.save();
    console.log(`✅ Limit Reset. New Limit: ${user.repliesLimit}`);
};

const handleSubscriptionDeleted = async (subscription) => {
    const customerId = subscription.customer;
    const user = await User.findOne({ stripeCustomerId: customerId });

    if (user) {
        console.log(`📉 Subscription Expired for: ${user.email}. Downgrading to Free.`);

        // 1. Plan wapis 'Free' kar dein
        user.plan = 'Free';

        // 2. Limit wapis Free wali (50) kar dein
        user.repliesLimit = 50;

        // 3. Status update
        user.subscriptionStatus = 'inactive';
        user.stripeSubscriptionId = null; // ID clear kar dein taake wo naya plan le sake

        await user.save();
    }
};


export default {
    createCheckoutSession,
    createCustomerPortalSession,
    handleWebhook
};
