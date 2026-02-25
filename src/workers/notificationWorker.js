import cron from 'node-cron';
import User from '../models/user.model.js';
import Channel from '../models/channel.model.js'; // 🔥 Channel model import karein
import Video from '../models/video.model.js';
import Comment from '../models/comment.model.js';
import { sendPushNotification } from '../utils/pushNotifier.js';

export const startNotificationCron = () => {
    // Har 60 minute baad: '0 * * * *'
    cron.schedule('0 * * * *', async () => {
        console.log("🕵️ Checking for new comments across all channels...");

        try {
            // 1. Saare active users lein
            const users = await User.find({ isConnectedToYoutube: true });

            for (const user of users) {
                const settings = user.notificationSettings || {};
                if (settings.pauseNotifications) continue;

                // 🔥 2. Har User ke saare CONNECTED CHANNELS dhoondein
                const userChannels = await Channel.find({ user: user._id });

                for (const channel of userChannels) {
                    // 3. Is SPECIFIC channel ki latest video dhoondein
                    const latestVideo = await Video.findOne({ 
                        user: user._id, 
                        channel: channel._id // 🛡️ Filter by specific channel
                    }).sort({ publishedAt: -1 });

                    if (!latestVideo) continue;

                    // 4. Is SPECIFIC video aur SPECIFIC channel ke pending comments ginn-lein
                    const pendingCount = await Comment.countDocuments({
                        videoId: latestVideo.videoId,
                        channel: channel._id, // 🛡️ Filter by specific channel
                        status: 'Pending'
                    });

                    const userThreshold = settings.threshold || 20;

                    if (pendingCount >= userThreshold) {
                        console.log(`🔔 Threshold met for ${channel.youtubeChannelName}: ${pendingCount}`);
                        
                        await sendPushNotification(
                            user._id,
                            `RespondPilot: ${channel.youtubeChannelName}`, // 🏷️ Channel Name in Title
                            `You have ${pendingCount} new comments on your latest video. Review them now!`,
                            `${process.env.CLIENT_URL}/dashboard?channelId=${channel._id}`
                        );
                    }
                }
            }
        } catch (error) {
            console.error("🔥 Notification Engine Error:", error);
        }
    });
};














// import cron from 'node-cron';
// import User from '../models/user.model.js';
// import Video from '../models/video.model.js';
// import Comment from '../models/comment.model.js';
// import { sendPushNotification } from '../utils/pushNotifier.js';

// export const startNotificationCron = () => {
//     // Every minute for testing: '*/1 * * * *'
//     cron.schedule('*/1 * * * *', async () => {
//         console.log("🕵️ Checking for new comments...");

//         try {
//             const users = await User.find({ isConnectedToYoutube: true });
//             console.log(`👥 Found ${users.length} connected users.`);

//             if (users.length === 0) {
//                 console.log("ℹ️ No users with connected channels found.");
//                 return;
//             }

//             for (const user of users) {
//                 console.log(`-------------------------------`);
//                 console.log(`🧐 Processing User: ${user.email}`);

//                 // 🔥 FIX: Fields are top-level in User Model
//                 const isPaused = user.pauseNotifications || false;
//                 const userThreshold = user.threshold || 20;

//                 if (isPaused) {
//                     console.log(`🔇 Notifications are PAUSED for ${user.email}.`);
//                     continue;
//                 }

//                 // 2. Latest Video Check
//                 const latestVideo = await Video.findOne({ user: user._id }).sort({ publishedAt: -1 });

//                 if (!latestVideo) {
//                     console.log(`❌ No videos found in DB for ${user.email}. Run sync first.`);
//                     continue;
//                 }

//                 console.log(`🎥 Latest Video: ${latestVideo.title} (${latestVideo.videoId})`);

//                 // 3. Pending Count
//                 // 🔥 FIX: Model uses 'userId' field
//                 const pendingCount = await Comment.countDocuments({
//                     videoId: latestVideo.videoId,
//                     userId: user._id, 
//                     status: 'Pending' 
//                 });

//                 console.log(`📊 Stats: Pending: ${pendingCount} | Threshold: ${userThreshold}`);

//                 if (pendingCount >= userThreshold) {
//                     console.log(`🔔 THRESHOLD MET! Sending push...`);
//                     await sendPushNotification(
//                         user._id,
//                         "RespondPilot: Your audience is waiting!",
//                         `You have ${pendingCount} new comments. AI drafts are ready!`,
//                         `${process.env.CLIENT_URL}/dashboard?videoId=${latestVideo.videoId}`
//                     );
//                 } else {
//                     console.log(`😴 Threshold not met yet.`);
//                 }
//             }
//         } catch (error) {
//             console.error("🔥 Cron Worker Error:", error);
//         }
//     });
// };

