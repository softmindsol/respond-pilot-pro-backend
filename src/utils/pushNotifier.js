import webpush from '../config/webPush.js'; // Jo humne pehle banaya tha
import PushSubscription from '../models/pushSubscription.model.js';

export const sendPushNotification = async (userId, title, body, url) => {
    try {
        // User ki saari registered devices dhoondein (Mobile, Laptop etc)
        const subscriptions = await PushSubscription.find({ user: userId });

        const notifications = subscriptions.map(sub => {
            const payload = JSON.stringify({
                title,
                body,
                icon: '/logo192.png',
                data: { url } // Click karne par kahan jana hai
            });

            return webpush.sendNotification(sub.subscription, payload)
                .catch(err => {
                    if (err.statusCode === 410) {
                        // Agar user ne permission revoke kar di hai toh DB se delete kar den
                        return PushSubscription.deleteOne({ _id: sub._id });
                    }
                    console.error("Push Error:", err);
                });
        });

        await Promise.all(notifications);
    } catch (error) {
        console.error("Notifier Utility Error:", error);
    }
};