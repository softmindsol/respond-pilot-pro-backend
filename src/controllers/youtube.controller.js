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

        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export default {
    getAuthUrl,
    googleCallback,
    getComments
};