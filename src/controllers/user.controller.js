import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import Channel from "../models/channel.model.js";
import Video from "../models/video.model.js";
import Comment from "../models/comment.model.js";

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
        const { notificationSettings, threshold, pauseNotifications } = req.body; 
        console.log("📥 Update Settings aiCrisisDetection:", notificationSettings.aiCrisisDetection);
        
        const user = await User.findById(req.user._id);

        if (notificationSettings.aiCrisisDetection !== undefined) user.notificationSettings.aiCrisisDetection = notificationSettings.aiCrisisDetection;
        if (threshold !== undefined) {
             console.log("⚙️ Setting threshold to:", threshold);
             user.threshold = threshold;
        }
        if (pauseNotifications !== undefined) user.pauseNotifications = pauseNotifications;

        await user.save();
        console.log("✅ User updated. New threshold in DB object:", user.threshold);

        res.json({ 
            success: true, 
            settings: user.notificationSettings,
            threshold: user.threshold,
            pauseNotifications: user.pauseNotifications
        });

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


export const switchActiveChannel = async (req, res) => {
    try {
        const { channelId } = req.body;
        const userId = req.user._id;

        // 🔥 FIX: 'userId' ki jagah 'user' likhein kyunke Model mein field ka naam 'user' hai
        const channelExists = await Channel.findOne({ _id: channelId, user: userId });

        if (!channelExists) {
            console.log("❌ Filter failed. Check if this channel belongs to user:", userId);
            return res.status(404).json({ 
                message: "Channel not found or unauthorized." 
            });
        }

        // 2. Sab ko inactive karein
        await Channel.updateMany(
            { user: userId }, // 🔥 Yahan bhi 'user' karein
            { $set: { isActive: false } }
        );

        // 3. Selected ko active karein
        channelExists.isActive = true;
        await channelExists.save();

        // 4. User model update
        await User.findByIdAndUpdate(userId, { activeChannel: channelExists._id });

        res.json({ 
            success: true, 
            message: `Switched to ${channelExists.youtubeChannelName}`
        });

    } catch (error) {
        console.error("🔥 Switch Error:", error);
        res.status(500).json({ message: "Internal server error." });
    }
};

// API for Header to list all channels
export const getMyChannels = async (req, res) => {
    const channels = await Channel.find({ user: req.user._id }).select('youtubeChannelName authorAvatar isActive');
    res.json(channels);
};

export const removeChannel = async (req, res) => {
    try {
        const { channelId } = req.body;
        const userId = req.user._id;

        // 1. Check ownership
        const channel = await Channel.findOne({ _id: channelId, user: userId });
        if (!channel) {
            return res.status(404).json({ message: "Channel not found or unauthorized." });
        }

        console.log(`🗑️ Deleting data for channel: ${channel.youtubeChannelName}`);

        // 2. 🔥 SURGICAL CLEANUP: Delete associated data
        await Comment.deleteMany({ channel: channelId, userId: userId });
        await Video.deleteMany({ channel: channelId, user: userId });

        // 3. Delete the Channel record itself
        await Channel.findByIdAndDelete(channelId);

        // 4. Update User Model
        const remainingChannels = await Channel.find({ user: userId });
        
        let updateData = {};
        
        if (remainingChannels.length === 0) {
            updateData.activeChannel = null;
            updateData.isConnectedToYoutube = false;
        } else {
            // Agar deleted channel hi active tha, toh kisi aur pe switch karein
            if (req.user.activeChannel?.toString() === channelId.toString()) {
                updateData.activeChannel = remainingChannels[0]._id;
            }
        }

        if (Object.keys(updateData).length > 0) {
            await User.findByIdAndUpdate(userId, { $set: updateData });
        }

        res.json({ 
            success: true, 
            message: "Channel removed successfully.",
            remainingCount: remainingChannels.length,
            activeChannelId: updateData.activeChannel !== undefined ? updateData.activeChannel : req.user.activeChannel
        });

    } catch (error) {
        console.error("🔥 Remove Channel Error:", error);
        res.status(500).json({ message: error.message });
    }
};