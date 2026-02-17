import cron from 'node-cron';
import User from '../models/user.model.js';
import Video from '../models/video.model.js';
import Comment from '../models/comment.model.js';
import { sendPushNotification } from '../utils/pushNotifier.js';

export const startNotificationCron = () => {
    // 🔥 Cron Rule: Har 60 minute baad (0 * * * *)
    cron.schedule('*0 * * * *', async () => {
        console.log("🕵️ Checking for new comments (Hourly Sync)...");

        try {
            // 1. Un users ko dhoondein jinhone channel connect kiya hua hai
            const users = await User.find({ isConnectedToYoutube: true });

            for (const user of users) {
                // 2. Har user ki sabse LATEST video dhoondein
                const latestVideo = await Video.findOne({ user: user._id })
                    .sort({ publishedAt: -1 });

                if (!latestVideo) continue;

                // 3. Check Pending Comments count for this video in our DB
                // (Note: Hamara Sync logic use Dashboard k waqt chalta hai, 
                // yahan hum count check kr rhy hain)
                const pendingCount = await Comment.countDocuments({
                    videoId: latestVideo.videoId,
                    userId: user._id,
                    status: 'Pending'
                });

                // 🔥 THRESHOLD CHECK: 20 ya usse zyada pending hon tabhi notify karo
                if (pendingCount >= 20) {
                    console.log(`🔔 Notifying ${user.email} about ${pendingCount} comments.`);
                    
                    await sendPushNotification(
                        user._id,
                        "RespondPilot: Your audience is waiting!",
                        `You have ${pendingCount} new comments on your latest video. AI drafts are ready—review and post them now!`,
                        `${process.env.CLIENT_URL}/dashboard?videoId=${latestVideo.videoId}`
                    );
                }
            }
        } catch (error) {
            console.error("Cron Worker Error:", error);
        }
    });
};