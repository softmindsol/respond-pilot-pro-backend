import { google } from 'googleapis';
import User from '../models/user.model.js';
import Video from '../models/video.model.js';
import Comment from '../models/comment.model.js';
import Channel from '../models/channel.model.js';

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

export const handleCallback = async (code, userId) => {
    // 1. Get Tokens from Google
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // 2. Get YouTube Channel Details
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({ part: 'snippet,contentDetails', mine: true });
    
    if (!channelRes.data.items || channelRes.data.items.length === 0) {
        throw new Error('No YouTube channel found for this Google account.');
    }

    const ytChannelData = channelRes.data.items[0];
    const channelId = ytChannelData.id;

    // 3. Mark all current user's other channels as inactive
    await Channel.updateMany({ user: userId }, { $set: { isActive: false } });

    // 4. Check if this Channel exists in our DB (Channel-Centric Check)
    let channelRecord = await Channel.findOne({ youtubeChannelId: channelId });
    const currentUser = await User.findById(userId);

    if (channelRecord) {
        const previousOwnerId = channelRecord.user;

        // --- 🚀 SCENARIO: MIGRATION (Owner Change) ---
        if (previousOwnerId.toString() !== userId.toString()) {
            const previousOwner = await User.findById(previousOwnerId);
            
            console.log(`🔄 Surgical Migration: Moving ${channelId} from ${previousOwner?.email} to ${currentUser.email}`);

            // A. Quota & Plan Migration
            // User B (New) gets User A's (Old) plan and EXACT usage
            if (currentUser.plan === 'Free') {
                currentUser.plan = previousOwner?.plan || 'Free';
                currentUser.repliesLimit = previousOwner?.repliesLimit || 50;
                currentUser.repliesUsed = previousOwner?.repliesUsed || 0; // 🔥 Fix: 3/50 used migrate hoga
                
                // Stripe Migration
                currentUser.stripeCustomerId = previousOwner?.stripeCustomerId;
                currentUser.stripeSubscriptionId = previousOwner?.stripeSubscriptionId;
                currentUser.subscriptionStatus = previousOwner?.subscriptionStatus;

                // B. Reset Previous Owner (User A)
                if (previousOwner) {
                    previousOwner.plan = 'Free';
                    previousOwner.repliesLimit = 0; // Usage limit zero kyunke ye migrat ho gayi
                    previousOwner.repliesUsed = 0;
                    previousOwner.stripeSubscriptionId = null;
                    previousOwner.subscriptionStatus = 'inactive';
                    
                    // Agar ye User A ka active channel tha, to pointer saaf karo
                    if (previousOwner.activeChannel?.toString() === channelRecord._id.toString()) {
                        previousOwner.activeChannel = null;
                    }
                    await previousOwner.save();
                }
            }

            // C. 🔥 DATA LEAK FIX: Re-assign all Videos and Comments to New Owner
            // Taake User A ko dropdown mein purana data nazar na aaye
            await Video.updateMany({ videoId: { $exists: true }, user: previousOwnerId }, { $set: { user: userId } });
            await Comment.updateMany({ userId: previousOwnerId, videoId: { $exists: true } }, { $set: { userId: userId } });

            // D. Transfer Channel Ownership
            channelRecord.user = userId;
            channelRecord.isActive = true;
            if (tokens.refresh_token) channelRecord.youtubeRefreshToken = tokens.refresh_token;
            await channelRecord.save();
        } else {
            // Already owned by same user, just update token and status
            channelRecord.isActive = true;
            if (tokens.refresh_token) channelRecord.youtubeRefreshToken = tokens.refresh_token;
            await channelRecord.save();
        }
    } else {
        // --- 🛡️ SCENARIO: BRAND NEW CHANNEL ---
        channelRecord = await Channel.create({
            user: userId,
            youtubeChannelId: channelId,
            youtubeChannelName: ytChannelData.snippet.title,
            youtubeRefreshToken: tokens.refresh_token,
            authorAvatar: ytChannelData.snippet.thumbnails.default.url,
            isTrialClaimed: true,
            isActive: true
        });

        // Naye user ko 50 credits do agar wo fresh hai
        if (!currentUser.isOnboarded) {
            currentUser.repliesLimit = 50;
        }
    }

    // 5. Finalize Current User State
    currentUser.isConnectedToYoutube = true;
    currentUser.isOnboarded = true;
    currentUser.activeChannel = channelRecord._id; 
    await currentUser.save();

    return { 
        channelName: ytChannelData.snippet.title,
        activeChannelId: channelRecord._id 
    };
};
// export const handleCallback = async (code, userId) => {
//     const { tokens } = await oauth2Client.getToken(code);
//     oauth2Client.setCredentials(tokens);

//     const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
//     const channelRes = await youtube.channels.list({ part: 'snippet', mine: true });
    
//     const ytChannelData = channelRes.data.items[0];
//     const channelId = ytChannelData.id;

//     await Channel.updateMany({ userId: userId }, { $set: { isActive: false } });

//     // 1. Check: Does this Channel already exist?
//     let channelRecord = await Channel.findOne({ youtubeChannelId: channelId });
//     const currentUser = await User.findById(userId);

//     if (channelRecord) {
//         const previousOwnerId = channelRecord.user; // Note: Schema uses 'user', not 'userId'

//         // --- 🚀 SCENARIO: MIGRATION (Channel moves from User A to User B) ---
//         if (previousOwnerId.toString() !== userId.toString()) {
//             const previousOwner = await User.findById(previousOwnerId);
            
//             console.log(`🔄 Moving Channel ${channelId} from ${previousOwner?.email} to ${currentUser.email}`);

//             // A. Migrate Plan if new user is Free and old was Paid
//             if (currentUser.plan === 'Free' && previousOwner?.plan !== 'Free') {
//                 currentUser.plan = previousOwner.plan;
//                 currentUser.repliesLimit = previousOwner.repliesLimit;
//                 currentUser.repliesUsed = previousOwner.repliesUsed;
//                 currentUser.stripeCustomerId = previousOwner.stripeCustomerId;
//                 currentUser.stripeSubscriptionId = previousOwner.stripeSubscriptionId;
//                 currentUser.subscriptionStatus = previousOwner.subscriptionStatus;

//                 // Reset Old User
//                 previousOwner.plan = 'Free';
//                 previousOwner.repliesLimit = 0;
//                 previousOwner.stripeSubscriptionId = null;
//                 previousOwner.subscriptionStatus = 'inactive';
//                 // Remove active channel reference if it was this one
//                 if (previousOwner.activeChannel?.toString() === channelRecord._id.toString()) {
//                     previousOwner.activeChannel = null;
//                 }
//                 await previousOwner.save();
//             }

//             // B. Transfer Ownership
//             channelRecord.user = userId; // Update owner
//             if (tokens.refresh_token) channelRecord.youtubeRefreshToken = tokens.refresh_token;
//             await channelRecord.save();
//         } else {
//             // Check if token needs update even if same owner
//             if (tokens.refresh_token) {
//                 channelRecord.youtubeRefreshToken = tokens.refresh_token;
//                 await channelRecord.save();
//             }
//         }
//     } else {
//         // --- 🛡️ SCENARIO: BRAND NEW CHANNEL ---
//         channelRecord = await Channel.create({
//             user: userId,
//             youtubeChannelId: channelId,
//             youtubeChannelName: ytChannelData.snippet.title,
//             youtubeRefreshToken: tokens.refresh_token,
//             authorAvatar: ytChannelData.snippet.thumbnails.default.url,
//             isTrialClaimed: true, // Renamed from isTrialUsed based on schema read
//             isActive: true
//         });

//         // 50 Free Credits for new users
//         if (!currentUser.isOnboarded) {
//             currentUser.repliesLimit = 50;
//         }
//     }

//     // 2. Finalize User State
//     currentUser.isConnectedToYoutube = true;
//     currentUser.isOnboarded = true;
//     currentUser.activeChannel = channelRecord._id; // 🔥 FIX: Save MongoDB ObjectId
//     await currentUser.save();

//     return { channelName: ytChannelData.snippet.title };
// };

// channel Centeric
// export const handleCallback = async (code, userId) => {
//     const { tokens } = await oauth2Client.getToken(code);
//     oauth2Client.setCredentials(tokens);

//     const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
//     const channelRes = await youtube.channels.list({ part: 'snippet', mine: true });
    
//     if (!channelRes.data.items) throw new Error('No channel found');

//     const channelId = channelRes.data.items[0].id;
//     const channelName = channelRes.data.items[0].snippet.title;

//     // 1. Dhoondo ke kya ye Channel ID pehle se kisi ke paas hai?
//     const previousOwner = await User.findOne({ 
//         youtubeChannelId: channelId, 
//         _id: { $ne: userId } 
//     });

//     const currentUser = await User.findById(userId);

//     if (previousOwner) {
//         console.log(`🔄 Channel Centric Migration: Moving data from ${previousOwner.email} to ${currentUser.email}`);
        
//         // A. Naye account ko purane account ka status de do
//         currentUser.plan = previousOwner.plan;
//         currentUser.repliesLimit = previousOwner.repliesLimit;
//         currentUser.repliesUsed = previousOwner.repliesUsed;
//         currentUser.affiliateTier = previousOwner.affiliateTier;
//         currentUser.notificationSettings = previousOwner.notificationSettings;
//         currentUser.tone = previousOwner.tone;
//         currentUser.customToneDescription = previousOwner.customToneDescription;
//         currentUser.advancedPersonaInstruction = previousOwner.advancedPersonaInstruction;

//         // B. 🔥 NEW: Stripe & Subscription Migration
//          currentUser.stripeCustomerId = previousOwner.stripeCustomerId;
//         currentUser.stripeSubscriptionId = previousOwner.stripeSubscriptionId;
//         currentUser.subscriptionStatus = previousOwner.subscriptionStatus;

//         // C. Purane account ko "Nanga" (Reset) kar do taake wo abuse na ho sake
//         previousOwner.youtubeChannelId = null;
//         previousOwner.youtubeChannelName = null;
//         previousOwner.youtubeRefreshToken = null;
//         previousOwner.isConnectedToYoutube = false;
//         previousOwner.plan = 'Free';
//         previousOwner.repliesLimit = 0; // Kyunke is channel ka quota transfer ho chuka hai
//         previousOwner.repliesUsed = 0;

//         await previousOwner.save();
//         console.log(`✅ Previous owner ${previousOwner.email} has been unlinked and reset.`);

//     } else {
//         // --- 🛡️ STRATEGY: ANTI-ABUSE CHECK ---
//         // Agar ye channel pehle kabhi system mein aya hi nahi (First time ever)
//         // To hi isay 50 free credits milenge.
        
//         if (!currentUser.isOnboarded) {
//             // Check if this channel ID ever existed in our records (even if unlinked now)
//             // (Note: Iske liye aap ek 'ChannelHistory' table bhi bana sakte hain, 
//             // lekin filhal User table se hi check karte hain)
            
//             currentUser.repliesLimit = 50; // Pehli baar ane par 50 credits
//         }
//     }

//     // 2. Finalize Connection for Current User
//     currentUser.youtubeChannelId = channelId;
//     currentUser.youtubeChannelName = channelName;
//     currentUser.isConnectedToYoutube = true;
//     currentUser.isOnboarded = true; // 🔥 User is now fully onboarded
    
//     if (tokens.refresh_token) {
//         currentUser.youtubeRefreshToken = tokens.refresh_token;
//     }

//     await currentUser.save();

//     return { channelName };
// };

// email-centric
// const handleCallback = async (code, userId) => {
//     const { tokens } = await oauth2Client.getToken(code);
//     oauth2Client.setCredentials(tokens);

//     // Fetch Channel Details
//     const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
//     const response = await youtube.channels.list({
//         part: 'snippet,contentDetails,statistics',
//         mine: true
//     });

//     if (!response.data.items || response.data.items.length === 0) {
//         throw new Error('No YouTube channel found for this Google account.');
//     }

//     const channel = response.data.items[0];

//     // Update User in DB
//     const user = await User.findById(userId);
//     if (!user) throw new Error('User not found.');

//     user.youtubeChannelId = channel.id;
//     user.youtubeChannelName = channel.snippet.title;
//     user.isConnectedToYoutube = true;

//     // Only save refresh token if it exists (usually only returned on first consent)
//     if (tokens.refresh_token) {
//         user.youtubeRefreshToken = tokens.refresh_token;
//     }

//     await user.save();
//     return { channelName: channel.snippet.title };
// };

const getChannelComments = async (userId, pageToken = '', videoId = null) => {
    // 1. User & Active Channel Fetch
    const user = await User.findById(userId);
    if (!user || !user.activeChannel) throw new Error('No active channel found. Please select a channel.');

    const channel = await Channel.findById(user.activeChannel).select('+youtubeRefreshToken');
    if (!channel || !channel.youtubeRefreshToken) throw new Error('Active channel not connected to YouTube.');

    // 2. Credentials
    oauth2Client.setCredentials({ refresh_token: channel.youtubeRefreshToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        // 3. Request Parameters
        const requestParams = {
            part: 'snippet,replies',
            maxResults: 30,
            pageToken: pageToken || undefined,
            order: 'time', 
            textFormat: 'plainText' 
        };

        if (videoId) {
            requestParams.videoId = videoId;
        } else {
            requestParams.allThreadsRelatedToChannelId = channel.youtubeChannelId;
        }

        // 4. API Call
        const response = await youtube.commentThreads.list(requestParams);

        // 5. Data Cleaning
        const allComments = response.data.items.map(item => {
            const topComment = item.snippet.topLevelComment.snippet;
            let replies = [];
            if (item.replies && item.replies.comments) {
                replies = item.replies.comments.map(reply => ({
                    id: reply.id,
                    author: reply.snippet.authorDisplayName,
                    authorImage: reply.snippet.authorProfileImageUrl,
                    text: reply.snippet.textDisplay,
                    publishedAt: reply.snippet.publishedAt,
                    isOwner: reply.snippet.authorChannelId.value === channel.youtubeChannelId
                })).reverse();
            }

            return {
                id: item.id,
                video_id: topComment.videoId,
                author: topComment.authorDisplayName,
                authorImage: topComment.authorProfileImageUrl,
                text: topComment.textDisplay,
                publishedAt: topComment.publishedAt,
                likeCount: topComment.likeCount,
                replyCount: item.snippet.totalReplyCount,
                canReply: item.snippet.canReply,
                videoLink: `https://www.youtube.com/watch?v=${topComment.videoId}&lc=${item.id}`,
                replies: replies
            };
        });

        const pendingComments = allComments.filter(c => c.status === "Pending");
        const repliedComments = allComments.filter(c => c.status === "Replied");

        return {
            allComments, 
            pendingComments,
            repliedComments,
            nextPageToken: response.data.nextPageToken,
            pageInfo: response.data.pageInfo
        };

    } catch (error) {
        console.error('YouTube API Error:', error.message);
        if (error.message.includes('disabled comments') || error.code === 403) {
            return {
                allComments: [],
                pendingComments: [],
                repliedComments: [],
                nextPageToken: null,
                pageInfo: { totalResults: 0 }
            };
        }
        throw new Error('Failed to fetch comments.');
    }
};

// const getChannelVideos = async (userId, pageToken = '', forceRefresh = false, page = 1, limit = 50) => {
//     const user = await User.findById(userId).select('+youtubeRefreshToken');

//     if (!user || !user.isConnectedToYoutube || !user.youtubeRefreshToken) {
//         throw new Error('User is not connected to YouTube.');
//     }

//     const timeDiff = user.lastVideoSync ? (new Date() - new Date(user.lastVideoSync)) : Infinity;
//     const isDataFresh = timeDiff < 24 * 60 * 60 * 1000; // 24 Hours

//     // 1. CHECK CACHE (DATABASE)
//     // Agar forceRefresh nahi hai aur data 24 ghante purana nahi hai
//     if (isDataFresh && !forceRefresh && !pageToken) {

//         // 🔥 CHANGE 1: DB Pagination & Sorting
//         const skip = (page - 1) * limit;

//         const cachedVideos = await Video.find({ user: userId })
//             .sort({ publishedAt: -1 }) // 🔥 Latest Video Top Par
//             .skip(skip)
//             .limit(limit);

//         const totalVideos = await Video.countDocuments({ user: userId });

//         if (cachedVideos.length > 0) {
//             console.log("⚡ Serving Videos from Database (Cache)");
//             return {
//                 videos: cachedVideos,
//                 total: totalVideos,
//                 page: page,
//                 totalPages: Math.ceil(totalVideos / limit),
//                 source: 'cache'
//             };
//         }
//     }

//     // 2. FETCH FROM YOUTUBE API (Optimization: Using PlaylistItems instead of Search)
//     console.log("🌐 Fetching Videos from YouTube API");

//     oauth2Client.setCredentials({ refresh_token: user.youtubeRefreshToken });
//     const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

//     try {
//         // A. Get "Uploads" Playlist ID (Cost: 1 Unit)
//         const channelRes = await youtube.channels.list({
//             part: 'contentDetails',
//             mine: true
//         });
//         const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;

//         // B. Get Videos from Playlist (Cost: 1 Unit) - TOTAL 2 UNITS only!
//         const response = await youtube.playlistItems.list({
//             part: 'snippet,status',
//             playlistId: uploadsPlaylistId,
//             maxResults: 50,
//             pageToken: pageToken || undefined
//         });
// console.log("response:",response)
//         const validItems = response.data.items.filter(item =>
//             item.status.privacyStatus !== 'private'
//         );
//         // 3. SAVE TO DATABASE (Bulk Upsert)
//         const videosToSave = validItems.map(item => ({ // response.data.items ki jagah validItems use karein
//             updateOne: {
//                 filter: { videoId: item.snippet.resourceId.videoId },
//                 update: {
//                     user: userId,
//                     videoId: item.snippet.resourceId.videoId,
//                     title: item.snippet.title,
//                     thumbnail: item.snippet.thumbnails?.medium?.url,
//                     publishedAt: item.snippet.publishedAt
//                 },
//                 upsert: true
//             }
//         }));

//         if (videosToSave.length > 0) {
//             await Video.bulkWrite(videosToSave);

//             // Update User Sync Time
//             user.lastVideoSync = new Date();
//             await user.save();
//         }

//         // 4. Return Clean Data
//         const videos = response.data.items.map(item => ({
//             videoId: item.snippet.resourceId.videoId,
//             title: item.snippet.title,
//             thumbnail: item.snippet.thumbnails?.medium?.url,
//             publishedAt: item.snippet.publishedAt,
//             videoLink: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
//         }));

//         const freshVideos = await Video.find({ user: userId })
//             .sort({ publishedAt: -1 }) // 🔥 Ensure Latest First
//             .limit(limit);

//         return {
//             videos: freshVideos,
//             nextPageToken: response.data.nextPageToken,
//             pageInfo: response.data.pageInfo,
//             source: 'api'
//         };

//     } catch (error) {
//         console.error('YouTube API Error:', error);
     
//         throw new Error('Failed to fetch videos from YouTube');
//     }
// };

export const getChannelVideos = async (userId, pageToken = '', forceRefresh = false, page = 1, limit = 50) => {
    // 1. Resolve Channel
    const user = await User.findById(userId);
    if (!user || !user.activeChannel) throw new Error('No active channel set.');

    const channel = await Channel.findById(user.activeChannel).select('+youtubeRefreshToken');
    if (!channel || !channel.youtubeRefreshToken) throw new Error('Channel token missing.');

    // 2. CACHE CHECK (Using Channel ID)
    if (!forceRefresh && !pageToken && channel.lastVideoSync) {
        const timeDiff = new Date() - new Date(channel.lastVideoSync);
        if (timeDiff < 24 * 60 * 60 * 1000) {
            const skip = (page - 1) * limit;
            const cachedVideos = await Video.find({ channel: channel._id })
                .sort({ publishedAt: -1 })
                .skip(skip)
                .limit(limit);
            if (cachedVideos.length > 0) return { videos: cachedVideos, source: 'cache' };
        }
    }

    // 3. YOUTUBE API SETUP
    oauth2Client.setCredentials({ refresh_token: channel.youtubeRefreshToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        const channelRes = await youtube.channels.list({ part: 'contentDetails', id: channel.youtubeChannelId });
        const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;

        let allFetchedVideos = [];
        let currentToken = pageToken || '';
        
        // 🔥 FULL SYNC LOGIC
        if (forceRefresh) {
            console.log(`🔄 Starting Full Sync for Channel: ${channel.youtubeChannelName}`);
            let hasNextPage = true;
            let safetyCounter = 0; 

            while (hasNextPage && safetyCounter < 10) {
                const res = await youtube.playlistItems.list({
                    part: 'snippet,status',
                    playlistId: uploadsPlaylistId,
                    maxResults: 50,
                    pageToken: currentToken || undefined
                });

                allFetchedVideos = [...allFetchedVideos, ...res.data.items];
                currentToken = res.data.nextPageToken;
                if (!currentToken) hasNextPage = false;
                safetyCounter++;
            }
        } else {
            const res = await youtube.playlistItems.list({
                part: 'snippet,status',
                playlistId: uploadsPlaylistId,
                maxResults: 50,
                pageToken: currentToken || undefined
            });
            allFetchedVideos = res.data.items;
            currentToken = res.data.nextPageToken;
        }

        const validItems = allFetchedVideos.filter(item => item.status.privacyStatus !== 'private');
        const fetchedVideoIds = validItems.map(item => item.snippet.resourceId.videoId);

        // 🔥 4. CLEANUP: Only delete videos for THIS channel that are no longer on YouTube
        if (forceRefresh) {
            await Video.deleteMany({
                channel: channel._id,
                videoId: { $nin: fetchedVideoIds }
            });
        }

        // 🔥 5. UPSERT with Channel Reference
        const ops = validItems.map(item => ({
            updateOne: {
                filter: { videoId: item.snippet.resourceId.videoId, channel: channel._id },
                update: {
                    user: userId,
                    channel: channel._id,
                    videoId: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    thumbnail: item.snippet.thumbnails?.medium?.url,
                    publishedAt: item.snippet.publishedAt
                },
                upsert: true
            }
        }));

        if (ops.length > 0) {
            await Video.bulkWrite(ops);
            channel.lastVideoSync = new Date(); // Update Channel Sync Time
            await channel.save();
        }

        // 6. RETURN DATA
        const freshVideos = await Video.find({ channel: channel._id }).sort({ publishedAt: -1 }).limit(limit);
        return { videos: freshVideos, nextPageToken: currentToken, source: 'api' };

    } catch (error) {
        console.error('YouTube API Error:', error);
        throw new Error('Failed to sync channel videos');
    }
};

export const postReplyToComment = async (userId, commentId, replyText) => {
    // 1. User & Channel Fetch
    const user = await User.findById(userId);
    if (!user || !user.activeChannel) throw new Error('No active channel selected.');

    const channel = await Channel.findById(user.activeChannel).select('+youtubeRefreshToken');
    if (!channel || !channel.youtubeRefreshToken) throw new Error('Channel authorization missing.');

    // CHECK LIMIT
    if (user.repliesUsed >= user.repliesLimit) {
        throw new Error('You have reached your reply limit. Please upgrade your plan.');
    }

    // 2. Auth Credentials
    oauth2Client.setCredentials({ refresh_token: channel.youtubeRefreshToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        // 3. YouTube API: Comments.insert Call
        const response = await youtube.comments.insert({
            part: 'snippet',
            requestBody: {
                snippet: {
                    parentId: commentId, 
                    textOriginal: replyText 
                }
            }
        });

        // 4. Increment Count Correctly
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { repliesUsed: 1 } },
            { new: true } 
        );

        return {
            ...response.data,
            repliesUsed: updatedUser.repliesUsed,
            repliesLimit: updatedUser.repliesLimit
        };

    } catch (error) {
        console.error('YouTube Post Reply Error:', error.message);
        throw new Error('Failed to post reply on YouTube.');
    }
};

// export const getSmartComments = async (user, videoId, pageToken = '',forceRefresh = false) => {
//     // 1. Check DB count
//     const dbCount = await Comment.countDocuments({ videoId, userId: user._id });
//     // 🔥 LOGIC: YouTube se fetch kab karna hai?
//     // - Agar DB khali hai
//     // - Ya user ne specifically 'Load More' (pageToken) maanga hai
//     // - Ya user ne manually 'Refresh' ka button dabaya hai
//     const shouldFetchFromYouTube = dbCount === 0 || pageToken || forceRefresh;
//     let ytNextPageToken = null;

//     // 2. LOGIC: Fetch from YouTube if DB is empty OR user is paginating
//     if (shouldFetchFromYouTube) {
// console.log(`🌐 API Call to YouTube. Reason: ${pageToken ? 'Pagination' : forceRefresh ? 'Manual Refresh' : 'Initial Sync'}`);
//                    // 🔥 STEP: OAuth Client ko authorize karein
//         oauth2Client.setCredentials({
//             refresh_token: user.youtubeRefreshToken
//         });
//         const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
//         const ytResponse = await youtube.commentThreads.list({
//             part: 'snippet,replies',
//             videoId: videoId,
//             maxResults: 50,
//             pageToken: pageToken || undefined,
//             order: 'time',
//             textFormat: 'plainText'
//         });

//         const ytComments = ytResponse.data.items || [];
//         ytNextPageToken = ytResponse.data.nextPageToken; // Save token to return later

//         // 3. 🔥 Bulk Upsert Logic (Inside the loop)
//         if (ytComments.length > 0) {
//             const ops = ytComments.map(item => {
//                 const topComment = item.snippet.topLevelComment.snippet;
                
//                 // --- Replies Extraction (Ab ye har item ke liye chale ga) ---
//                 let currentCommentReplies = [];
//                 let ownerRepliedInThisThread = false;

//                 if (item.replies && item.replies.comments) {
//                     currentCommentReplies = item.replies.comments.map(r => {
//                         const isOwner = r.snippet.authorChannelId.value === user.youtubeChannelId;
//                         if (isOwner) ownerRepliedInThisThread = true;

//                         return {
//                             id: r.id,
//                             author: r.snippet.authorDisplayName,
//                             authorImage: r.snippet.authorProfileImageUrl,
//                             text: r.snippet.textDisplay,
//                             publishedAt: r.snippet.publishedAt,
//                             isOwner: isOwner
//                         };
//                     });
//                 }

//                 return {
//                     updateOne: {
//                         filter: { commentId: item.id },
//                         update: {
//                             userId: user._id,
//                             videoId,
//                             authorName: topComment.authorDisplayName,
//                             authorAvatar: topComment.authorProfileImageUrl,
//                             text: topComment.textDisplay,
//                             replies: currentCommentReplies, // Corrected: Specific to this comment
//                             status: ownerRepliedInThisThread ? "Replied" : "Pending",
//                             publishedAt: topComment.publishedAt,
//                             lastSyncedAt: new Date()
//                         },
//                         upsert: true
//                     }
//                 };
//             });
//             await Comment.bulkWrite(ops);
//         }
//     } else {
//         console.log("⚡ Serving from DB Cache");
//     }

//     // 4. FINAL STEP: Fetch from DB (Sorted: Pending First, then Latest)
//     const comments = await Comment.find({ videoId, userId: user._id })
//         .sort({ status: 1, publishedAt: -1 }) // Pending (P) comes before Replied (R)
//         .limit(pageToken ? 1000 : 50); 

//     return {
//         comments,
//         nextPageToken: ytNextPageToken // Ye frontend ko batayega ke agla page hai ya nahi
//     };
// };


export const getSmartComments = async (user, videoId, pageToken = '', refresh  ) => {
    // 1. Fetch User & Active Channel
    const fullUser = await User.findById(user._id);
    if (!fullUser || !fullUser.activeChannel) throw new Error('No active channel found.');
    const videoOwner = await Video.findOne({ videoId: videoId, user: user._id });
if (!videoOwner) {
        // Agar video is user ki nahi hai, toh khali data bhejain
        return { comments: [], nextPageToken: null };
    }
    const channel = await Channel.findById(fullUser.activeChannel).select('+youtubeRefreshToken');
    if (!channel || !channel.youtubeRefreshToken) throw new Error('Channel token missing.');

    // 2. Check current DB state (Filter by Video AND Channel)
    const dbCount = await Comment.countDocuments({ videoId, channel: channel._id });

    // Trigger API if: DB empty, Pagination requested, or Manual Refresh
    const shouldFetchFromYouTube = dbCount === 0 || pageToken || refresh;
    
    let ytNextPageToken = null;

    if (shouldFetchFromYouTube) {
        console.log(`🌐 Fetching from YouTube [${channel.youtubeChannelName}]. Reason: ${pageToken ? 'Pagination' : refresh ? 'Manual Refresh' : 'Initial Sync'}`);
        
        oauth2Client.setCredentials({ refresh_token: channel.youtubeRefreshToken });
        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
        
        try {
            const ytResponse = await youtube.commentThreads.list({
                part: 'snippet,replies',
                videoId: videoId,
                maxResults: 50,
                pageToken: pageToken || undefined,
                order: 'time',
                textFormat: 'plainText'
            });

            const ytComments = ytResponse.data.items || [];
            ytNextPageToken = ytResponse.data.nextPageToken;

            // 3. Bulk Upsert Logic
            if (ytComments.length > 0) {
                const ops = ytComments.map(item => {
                    const topComment = item.snippet.topLevelComment.snippet;
                    
                    let currentCommentReplies = [];
                    let ownerRepliedInThisThread = false;

                    if (item.replies && item.replies.comments) {
                        currentCommentReplies = item.replies.comments.map(r => {
                            const isOwner = r.snippet.authorChannelId.value === channel.youtubeChannelId;
                            if (isOwner) ownerRepliedInThisThread = true;

                            return {
                                id: r.id,
                                author: r.snippet.authorDisplayName,
                                authorImage: r.snippet.authorProfileImageUrl,
                                text: r.snippet.textDisplay,
                                publishedAt: r.snippet.publishedAt,
                                isOwner: isOwner
                            };
                        });
                    }

                    return {
                        updateOne: {
                            filter: { commentId: item.id },
                            update: {
                                $set: { 
                                    userId: fullUser._id,
                                    channel: channel._id, // 🔥 Link to Channel
                                    videoId,
                                    authorName: topComment.authorDisplayName,
                                    authorAvatar: topComment.authorProfileImageUrl,
                                    text: topComment.textDisplay,
                                    replies: currentCommentReplies,
                                    status: ownerRepliedInThisThread ? "Replied" : "Pending",
                                    publishedAt: topComment.publishedAt,
                                    lastSyncedAt: new Date()
                                }
                            },
                            upsert: true
                        }
                    };
                });
                await Comment.bulkWrite(ops);

                // 4. 🔥 Update Video Meta: Store the token for this specific video & Channel
                // (Using findOneAndUpdate to ensure we match the right channel's video record, though VideoId is unique)
                await Video.findOneAndUpdate(
                    { videoId, channel: channel._id }, 
                    { nextPageToken: ytNextPageToken },
                    { upsert: false } // Video should ideally exist from getVideos, but if not, logic implies it must exist to have ID
                );
            }
        } catch (apiError) {
            console.error("YouTube API Error:", apiError.message);
            // Handle Quota or Disabled Comments
            if (apiError.message.includes('disabled comments')) {
                return { comments: [], nextPageToken: null };
            }
            throw apiError;
        }
    } else {
        console.log("⚡ Serving from DB Cache");
        // 🔥 Get stored token from Video model
        const videoMeta = await Video.findOne({ videoId, channel: channel._id });
        ytNextPageToken = videoMeta?.nextPageToken;
    }

    // 5. FINAL QUERY: Fetch from DB
    // Sort logic: 1. Pending First (alphabetical P before R), 2. Newest Published First
    const comments = await Comment.find({ videoId, channel: channel._id })
        .sort({ status: 1, publishedAt: -1 }) 
        .limit(pageToken ? 500 : 50); 

    return {
        comments,
        nextPageToken: ytNextPageToken 
    };
};
export default {
    generateAuthUrl,
    handleCallback,
    getChannelComments,
    getChannelVideos,
    postReplyToComment,
    getSmartComments

};