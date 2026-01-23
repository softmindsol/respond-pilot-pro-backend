import Commission from '../models/commission.model.js';
import User from '../models/user.model.js';
import Payout from '../models/payout.model.js';
import Transaction from '../models/transaction.model.js';

// 1. Get All Users (With Pagination & Search)
export const getAllUsers = async (req, res) => {
    try {
        const { search, page = 1, plan, affiliateTier } = req.query;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Base Query
        let query = {};

        // 1. Search (Name or Email)
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { name: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. Filter by Plan (if provided)
        if (plan) {
            query.plan = plan;
        }

        // 3. Filter by Affiliate Tier (if provided)
        if (affiliateTier) {
            query.affiliateTier = affiliateTier;
        }

        const users = await User.find(query)
            .select('-password -youtubeRefreshToken') // Sensitive data hide karein
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        const total = await User.countDocuments(query);

        res.json({
            users,
            page: Number(page),
            pages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 2. Toggle Affiliate Tier (Make Founding Partner)
export const updateUserTier = async (req, res) => {
    try {
        const { userId, tier } = req.body; // tier can be 'none', 'tier1', 'tier2'

        if (!['none', 'tier1', 'tier2'].includes(tier)) {
            return res.status(400).json({ message: "Invalid tier value" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.affiliateTier = tier;

        // Agar Tier 1 banaya hai, to Plan bhi "Founding Member" (Pro Plus features) kar do
        if (tier === 'tier1') {
            // Logic: Is user ko Stripe check karne ki zaroorat nahi hogi (Middleware handle karega)
            // Aap UI ke liye plan name update kar sakte hain
             user.plan = 'Founding Partner'; 
             user.repliesLimit = 5000;
        }

        await user.save();

        res.json({
            success: true,
            message: `User updated to ${tier}`,
            user: { _id: user._id, affiliateTier: user.affiliateTier }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getPendingPayouts = async (req, res) => {
    try {
        // Sirf unhein dhoondo jinke paas paise hain (> 0)
        const affiliates = await User.find({ walletBalance: { $gt: 0 } })
            .select('name email affiliateTier walletBalance referralCode')
            .sort({ walletBalance: -1 }); // Ziada paise wale upar

        res.json(affiliates);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 4. Mark as Paid (Reset Balance)
export const processPayout = async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const adminId = req.user._id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.walletBalance < amount) {
            return res.status(400).json({ message: "Amount exceeds wallet balance" });
        }

        // 1. Create Payout Record (History)
        await Payout.create({
            affiliateId: user._id,
            amount: amount,
            processedBy: adminId
        });

        // 2. Reset User Wallet
        user.walletBalance = user.walletBalance - amount;

        // (Optional) Mark Commissions as Paid
        await Commission.updateMany(
            { affiliateId: user._id, status: 'pending' },
            { status: 'paid' }
        );

        await user.save();

        res.json({ success: true, message: `Payout of $${amount} recorded successfully!` });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getTransactions = async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        let query = {};

        // Fetch Data with User Details
        const transactions = await Transaction.find(query)
            .populate('userId', 'name email profileImage') // User ka data layen
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await Transaction.countDocuments(query);

        res.json({
            transactions,
            total,
            pages: Math.ceil(total / limit),
            currentPage: Number(page)
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getPaymentStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // 1. Total Revenue
        const totalRevenueResult = await Transaction.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = totalRevenueResult[0]?.total || 0;

        // 2. Monthly Revenue
        const monthlyRevenueResult = await Transaction.aggregate([
            { 
                $match: { 
                    status: 'completed',
                    createdAt: { $gte: startOfMonth }
                } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

        // 3. Success Rate
        const totalTxns = await Transaction.countDocuments({});
        const successfulTxns = await Transaction.countDocuments({ status: 'completed' });
        
        let successRate = 0;
        if (totalTxns > 0) {
            successRate = (successfulTxns / totalTxns) * 100;
        }

        // 4. Pending Payouts (From Commissions table)
        // Ye humne pichle steps me Commission model me save kia tha
        const pendingPayoutsResult = await Commission.aggregate([
            { $match: { status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
        ]);
        const pendingPayouts = pendingPayoutsResult[0]?.total || 0;

        res.json({
            totalRevenue,
            monthlyRevenue,
            successRate: parseFloat(successRate.toFixed(1)), // 1 decimal place (e.g. 94.5)
            pendingPayouts
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};