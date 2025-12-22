import { google } from 'googleapis';
import User from '../models/user.model.js';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
);

const generateAuthUrl = (userId) => {
    const scopes = [
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email'
    ];

    return oauth2Client.generateAuthUrl({
        access_type: 'offline', // Crucial for receiving a refresh token
        scope: scopes,
        prompt: 'consent', // Forces consent screen to ensure refresh token is returned
        state: userId.toString() // Pass user ID to identify them on callback
    });
};

const handleCallback = async (code, userId) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch Channel Details
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const response = await youtube.channels.list({
        part: 'snippet,contentDetails,statistics',
        mine: true
    });

    if (!response.data.items || response.data.items.length === 0) {
        throw new Error('No YouTube channel found for this Google account.');
    }

    const channel = response.data.items[0];

    // Update User in DB
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found.');

    user.youtubeChannelId = channel.id;
    user.youtubeChannelName = channel.snippet.title;
    user.isConnectedToYoutube = true;

    // Only save refresh token if it exists (usually only returned on first consent)
    if (tokens.refresh_token) {
        user.youtubeRefreshToken = tokens.refresh_token;
    }

    await user.save();
    return { channelName: channel.snippet.title };
};

const getChannelComments = async (userId, pageToken = '', videoId = null) => {
    // 1. User fetch karein
    const user = await User.findById(userId).select('+youtubeRefreshToken');

    if (!user || !user.isConnectedToYoutube || !user.youtubeRefreshToken) {
        throw new Error('User is not connected to YouTube or Token is missing.');
    }

    // 2. Credentials set karein
    oauth2Client.setCredentials({
        refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        // 3. Request Parameters banayein
        const requestParams = {
            part: 'snippet',
            maxResults: 20,
            pageToken: pageToken || undefined,
            order: 'time', // Latest comments pehle
            textFormat: 'plainText' // HTML tags hata kar simple text layega
        };

        // LOGIC: Agar videoId di hai to uske comments, warna pure channel ke videos ke comments
        if (videoId) {
            requestParams.videoId = videoId;
        } else {
            requestParams.allThreadsRelatedToChannelId = user.youtubeChannelId;
        }

        // 4. API Call
        const response = await youtube.commentThreads.list(requestParams);

        // 5. Data Clean Karna
        const comments = response.data.items.map(item => {
            const topComment = item.snippet.topLevelComment.snippet;
            return {
                id: item.id, // Comment ID (Reply karne ke liye ye chahiye hoga)
                video_id: topComment.videoId, // Kis video par comment aya
                author: topComment.authorDisplayName,
                authorImage: topComment.authorProfileImageUrl,
                text: topComment.textDisplay,
                publishedAt: topComment.publishedAt,
                likeCount: topComment.likeCount,
                replyCount: item.snippet.totalReplyCount,
                canReply: item.snippet.canReply,
                videoLink: `https://www.youtube.com/watch?v=${topComment.videoId}&lc=${item.id}` // Direct link to comment
            };
        });

        return {
            comments,
            nextPageToken: response.data.nextPageToken,
            pageInfo: response.data.pageInfo
        };

    } catch (error) {
        console.error('YouTube API Error:', error.message);
        throw new Error('Failed to fetch comments. Make sure the channel is connected.');
    }
};
export default {
    generateAuthUrl,
    handleCallback,
    getChannelComments
    
};