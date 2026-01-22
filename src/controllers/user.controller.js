import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";

// User khud Affiliate banna chahta hai (Tier 2)
export const joinAffiliateProgram = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Agar pehle se Tier 1 hai, to downgrade mat karo
        if (user.affiliateTier === 'tier1') {
            return res.status(400).json({ message: "You are already a Founding Partner (Tier 1)!" });
        }

        // Agar pehle se Tier 2 hai
        if (user.affiliateTier === 'tier2') {
            return res.status(200).json({ message: "You are already an affiliate." });
        }

        // Update to Tier 2
        user.affiliateTier = 'tier2';
        await user.save(); // Pre-save hook khud hi Referral Code generate kar dega (jo humne model mein lagaya tha)

        res.json({
            success: true,
            message: "Welcome to the Affiliate Program! You can now earn 15% commission.",
            user: {
                affiliateTier: user.affiliateTier,
                referralCode: user.referralCode
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateSettings = async (req, res) => {
    try {
        const { aiCrisisDetection } = req.body; // Boolean
        const user = await User.findById(req.user._id);

        // Security Check: Kya user qualify karta hai?
        // (Sirf Pro Plus aur Tier 1 allow hain)
        const isEligible = user.plan === 'Pro Plus' || 
                           user.plan === 'PRO_PLUS' || 
                           user.affiliateTier === 'tier1';

        if (!isEligible) {
            return res.status(403).json({ message: "This feature requires Pro Plus plan." });
        }

        user.notificationSettings.aiCrisisDetection = aiCrisisDetection;
        await user.save();

        res.json({ success: true, settings: user.notificationSettings });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20);

        res.json({ 
            success: true, 
            notifications 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOne({ _id: id, user: req.user._id });

        if (!notification) {
            return res.status(404).json({ message: "Notification not found" });
        }

        notification.isRead = true;
        await notification.save();

        res.json({ success: true, message: "Notification marked as read" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const completeOnboarding = async (req, res) => {
    try {
        const { tone } = req.body; // e.g., 'hype' or 'community'
        const user = await User.findById(req.user._id);

        if (!user) return res.status(404).json({ message: "User not found" });

        // 1. Save Tone
        user.tone = tone;
        
        // 2. Mark Onboarded
        user.isOnboarded = true;
        
        // 3. Ensure Security is ON (Just in case)
        // if (!user.notificationSettings) user.notificationSettings = {};
        // user.notificationSettings.aiCrisisDetection = true;

        await user.save();

        res.json({ 
            success: true, 
            message: "Setup complete!", 
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isOnboarded: true,
                tone: user.tone,
                // ... other fields
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const markAllNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.user._id, isRead: false },
            { $set: { isRead: true } }
        );

        res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};