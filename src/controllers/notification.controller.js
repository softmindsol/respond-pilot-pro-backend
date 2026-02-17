import PushSubscription from '../models/pushSubscription.model.js';

export const subscribeUser = async (req, res) => {
    try {
        const { subscription } = req.body;
        const userId = req.user._id;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ message: "Invalid subscription object" });
        }

        // 🔥 UPSERT LOGIC: 
        // Agar ye device pehle se saved hai toh update karo, warna naya banao.
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