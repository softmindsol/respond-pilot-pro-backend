import Commission from '../models/commission.model.js';
import User from '../models/user.model.js';
import Payout from '../models/payout.model.js';

// 1. Get All Users (With Pagination & Search)
export const getAllUsers = async (req, res) => {
    try {
        const { search, page = 1 } = req.query;
        const limit = 10;
        const skip = (page - 1) * limit;

        // Search Query
        const query = search
            ? {
                $or: [
                    { email: { $regex: search, $options: 'i' } },
                    { name: { $regex: search, $options: 'i' } }
                ]
            }
            : {};

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
            // user.plan = 'Founding Partner'; 
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