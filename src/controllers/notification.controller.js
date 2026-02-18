import PushSubscription from '../models/pushSubscription.model.js';

export const subscribeUser = async (req, res) => {
    try {
        const { subscription } = req.body;
        const userId = req.user._id;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ message: "Invalid subscription object" });
        }

        // 🔥 UPSERT LOGIC: 
        await PushSubscription.findOneAndUpdate(
            { 'subscription.endpoint': subscription.endpoint },
            { 
                user: userId, 
                subscription: subscription 
            },
            { upsert: true, new: true }
        );

        res.status(201).json({ 
            success: true, 
            message: "Device registered for push notifications successfully." 
        });
    } catch (error) {
        console.error("Push Subscribe Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

export const unsubscribeUser = async (req, res) => {
    try {
        const { endpoint } = req.body; // Browser ka unique URL

        if (!endpoint) return res.status(400).json({ message: "Endpoint required" });

        // Sirf is specific device ko remove karein
        await PushSubscription.deleteOne({ 'subscription.endpoint': endpoint });

        res.json({ success: true, message: "Unsubscribed successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};