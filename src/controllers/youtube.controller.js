import User from '../models/user.model.js';
import youtubeService from '../services/youtube.service.js';

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

        // user.repliesUsed = (user.repliesUsed || 0) + 1;
        // await user.save();
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $inc: { repliesUsed: 1 } }, // Increase by 1
            { new: true } // Humein updated user wapis chahiye
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

const disconnectChannel = async (req, res) => {
    try {
        const userId = req.user._id;

        // User ko update karein aur YouTube fields ko NULL/FALSE set karein
        await User.findByIdAndUpdate(userId, {
            isConnectedToYoutube: false,
            youtubeChannelId: null,
            youtubeChannelName: null,
            youtubeRefreshToken: null,
            lastVideoSync: null,
            // Agar aap chaho to 'tone' ya 'notificationSettings' reset na karein
            // taake user wapis aaye to settings wahi milen.
        });

        res.json({ success: true, message: "Channel disconnected successfully." });

    } catch (error) {
        console.error("Disconnect Error:", error);
        res.status(500).json({ message: "Failed to disconnect channel." });
    }
};
export default {
    getAuthUrl,
    googleCallback,
    getComments,
    getVideos,
    postReply,
    disconnectChannel
};