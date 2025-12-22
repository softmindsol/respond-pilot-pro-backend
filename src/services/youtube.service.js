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

export default {
    generateAuthUrl,
    handleCallback
};