import User from '../models/user.model.js';
import youtubeService from '../services/youtube.service.js';
import ReplyQueue from '../models/queue.model.js';
import Comment from '../models/comment.model.js';

const getAuthUrl = (req, res) => {
    try {
        // req.user is set by your protect middleware
        const url = youtubeService.generateAuthUrl(req.user._id);
        res.json({ url });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const googleCallback = async (req, res) => {
    const { code, state } = req.query; // 'state' contains the userId

    if (!code) {
        return res.status(400).send('Authorization code missing.');
    }

    try {
        await youtubeService.handleCallback(code, state);

        // Redirect to your Frontend Dashboard on success
        // Replace logic if your frontend URL is different
        const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/dashboard?success=channel_connected`);
    } catch (error) {
        console.error('YouTube Callback Error:', error);
        const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/dashboard?error=connection_failed`);
    }
};

const getComments = async (req, res) => {
    try {
        // URL se pageToken aur videoId lein
        // Example: /api/youtube/comments?videoId=12345&pageToken=abc
        const { pageToken, videoId } = req.query;

        // Service ko videoId pass karein
        const data = await youtubeService.getChannelComments(req.user._id, pageToken, videoId);
        res.json({
            comments: data.allComments, // Purani functionality na toote
            pendingComments: data.pendingComments, // 🔥 New Array for Action Center
            repliedComments: data.repliedComments, // Optional
            nextPageToken: data.nextPageToken,
            pageInfo: data.pageInfo
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
const getVideos = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const { pageToken, refresh } = req.query;
        const forceRefresh = refresh === 'true';

        const data = await youtubeService.getChannelVideos(req.user._id, pageToken, forceRefresh, page,limit);
        res.json(data);
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: error.message });
    }
};
const postReply = async (req, res) => {
    try {
        const { commentId, commentText } = req.body;
        const user = req.user; // User from middleware

        if (!commentId || !commentText) {
            return res.status(400).json({ message: 'Comment ID and reply text are required.' });
        }

        const data = await youtubeService.postReplyToComment(user._id, commentId, commentText);

        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $inc: { repliesUsed: 1 } },
            { new: true }
        );

        res.json({
            ...data,
            usage: {
                // Frontend ko updated count bhejen taake UI foran update ho
                repliesUsed: updatedUser.repliesUsed
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSyncedComments = async (req, res) => {
    try {
        const { videoId, pageToken, refresh } = req.query;
        if (!videoId) {
            return res.status(400).json({ message: 'Video ID is required.' });
        }
    
        // Pass user object (service will handle fetching activeChannel & token)
        const comments = await youtubeService.getSmartComments(req.user, videoId, pageToken, refresh);
        res.json(comments);

    } catch (error) {
        console.error("Sync Comments Error:", error);
        res.status(500).json({ message: error.message });
    }
};

const disconnectChannel = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);

        if (user.activeChannel) {
            // Option 1: Just unlink
            user.activeChannel = null;
            
            // Check if any other channels exist? 
            // For now, if they disconnect the active one, we mark isConnectedToYoutube as false 
            // until they switch to another one or reconnect.
            // But ideally we should check if other channels exist.
            // const channelCount = await Channel.countDocuments({ user: userId });
            // if (channelCount === 0) user.isConnectedToYoutube = false;
             user.isConnectedToYoutube = false; // Simple approach: Disconnect = Offline state

            await user.save();
        }

        res.json({ success: true, message: "Channel disconnected successfully." });

    } catch (error) {
        console.error("Disconnect Error:", error);
        res.status(500).json({ message: "Failed to disconnect channel." });
    }
};

export const queueBulkReplies = async (req, res) => {
    try {
        const { replies } = req.body; // Array of { commentId, replyText }
        const userId = req.user._id;
        console.log("User:", req.user);
        const channelId = req.user.activeChannel; // Correct field name
console.log("Replies:", replies);
console.log("User:", userId);
console.log("Channel ID:", channelId);

        if (!replies || replies.length === 0) return res.status(400).json({ message: "No replies provided" });

        // 1. Prepare Queue Documents
        const queueItems = replies.map(r => ({
            userId,
            channelId,
            commentId: r.commentId,
            replyText: r.replyText || r.commentText || r.reply,
            status: 'pending'
        }));

        // 2. Insert into Queue
        await ReplyQueue.insertMany(queueItems);

        // 3. Increment Usage Count Based on Comments Count (Upfront Charge)
        await User.findByIdAndUpdate(userId, { $inc: { repliesUsed: replies.length } });

        // 3. Mark these comments as "Replied" in our DB so they disappear from "Pending" feed
        const commentIds = replies.map(r => r.commentId);
        await Comment.updateMany(
            { commentId: { $in: commentIds } },
            { $set: { status: 'Replied' } } 
        );

        res.json({ 
            success: true, 
            message: `${replies.length} replies added to background queue. You can safely close the app.` 
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getQueueProgress = async (req, res) => {
    try {
        const userId = req.user._id;

        // Aaj ke ya active jobs dhoondein
        const pendingCount = await ReplyQueue.countDocuments({ userId, status: 'pending' });
        const processingCount = await ReplyQueue.countDocuments({ userId, status: 'processing' });
        const completedCount = await ReplyQueue.countDocuments({ userId, status: 'completed' });
        const failedCount = await ReplyQueue.countDocuments({ userId, status: 'failed' });

        const total = pendingCount + processingCount + completedCount + failedCount;

        res.json({
            totalInQueue: total,
            pending: pendingCount + processingCount,
            completed: completedCount,
            failed: failedCount,
            isDone: (pendingCount + processingCount) === 0 && total > 0
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};




export default {
    getAuthUrl,
    googleCallback,
    getComments,
    getVideos,
    postReply,
    getSyncedComments,
    disconnectChannel,
    getQueueProgress,
    queueBulkReplies
};