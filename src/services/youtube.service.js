import { google } from 'googleapis';
import User from '../models/user.model.js';
import Video from '../models/video.model.js';
import Comment from '../models/comment.model.js';

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

// channel Centeric
export const handleCallback = async (code, userId) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelRes = await youtube.channels.list({ part: 'snippet', mine: true });
    
    if (!channelRes.data.items) throw new Error('No channel found');

    const channelId = channelRes.data.items[0].id;
    const channelName = channelRes.data.items[0].snippet.title;

    // 1. Dhoondo ke kya ye Channel ID pehle se kisi ke paas hai?
    const previousOwner = await User.findOne({ 
        youtubeChannelId: channelId, 
        _id: { $ne: userId } 
    });

    const currentUser = await User.findById(userId);

    if (previousOwner) {
        console.log(`🔄 Channel Centric Migration: Moving data from ${previousOwner.email} to ${currentUser.email}`);
        
        // A. Naye account ko purane account ka status de do
        currentUser.plan = previousOwner.plan;
        currentUser.repliesLimit = previousOwner.repliesLimit;
        currentUser.repliesUsed = previousOwner.repliesUsed;
        currentUser.affiliateTier = previousOwner.affiliateTier;
        currentUser.notificationSettings = previousOwner.notificationSettings;
        currentUser.tone = previousOwner.tone;
        currentUser.customToneDescription = previousOwner.customToneDescription;
        currentUser.advancedPersonaInstruction = previousOwner.advancedPersonaInstruction;

        // B. 🔥 NEW: Stripe & Subscription Migration
         currentUser.stripeCustomerId = previousOwner.stripeCustomerId;
        currentUser.stripeSubscriptionId = previousOwner.stripeSubscriptionId;
        currentUser.subscriptionStatus = previousOwner.subscriptionStatus;

        // C. Purane account ko "Nanga" (Reset) kar do taake wo abuse na ho sake
        previousOwner.youtubeChannelId = null;
        previousOwner.youtubeChannelName = null;
        previousOwner.youtubeRefreshToken = null;
        previousOwner.isConnectedToYoutube = false;
        previousOwner.plan = 'Free';
        previousOwner.repliesLimit = 0; // Kyunke is channel ka quota transfer ho chuka hai
        previousOwner.repliesUsed = 0;

        await previousOwner.save();
        console.log(`✅ Previous owner ${previousOwner.email} has been unlinked and reset.`);

    } else {
        // --- 🛡️ STRATEGY: ANTI-ABUSE CHECK ---
        // Agar ye channel pehle kabhi system mein aya hi nahi (First time ever)
        // To hi isay 50 free credits milenge.
        
        if (!currentUser.isOnboarded) {
            // Check if this channel ID ever existed in our records (even if unlinked now)
            // (Note: Iske liye aap ek 'ChannelHistory' table bhi bana sakte hain, 
            // lekin filhal User table se hi check karte hain)
            
            currentUser.repliesLimit = 50; // Pehli baar ane par 50 credits
        }
    }

    // 2. Finalize Connection for Current User
    currentUser.youtubeChannelId = channelId;
    currentUser.youtubeChannelName = channelName;
    currentUser.isConnectedToYoutube = true;
    currentUser.isOnboarded = true; // 🔥 User is now fully onboarded
    
    if (tokens.refresh_token) {
        currentUser.youtubeRefreshToken = tokens.refresh_token;
    }

    await currentUser.save();

    return { channelName };
};

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
            part: 'snippet,replies',
            maxResults: 30,
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
        const allComments = response.data.items.map(item => {
            const topComment = item.snippet.topLevelComment.snippet;
            // 🔥 CHANGE 2: Replies Extract karna
            let replies = [];
            if (item.replies && item.replies.comments) {
                // Replies ko sort karein (Oldest first achay lagte hain thread mein)
                replies = item.replies.comments.map(reply => ({
                    id: reply.id,
                    author: reply.snippet.authorDisplayName,
                    authorImage: reply.snippet.authorProfileImageUrl,
                    text: reply.snippet.textDisplay,
                    publishedAt: reply.snippet.publishedAt,
                    isOwner: reply.snippet.authorChannelId.value === user.youtubeChannelId // Check agar ye apka reply hai
                })).reverse(); // Reverse taake purane pehle dikhen
            }

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
                // videoLink: `https://www.youtube.com/watch?v=${topComment.videoId}&lc=${item.id}` // Direct link to comment
                videoLink: `https://www.youtube.com/watch?v=${topComment.videoId}&lc=${item.id}`,
                replies: replies

            };


        });
        // 🔥 SEPARATE LISTS
        const pendingComments = allComments.filter(c => c.status === "Pending");
        const repliedComments = allComments.filter(c => c.status === "Replied");

        return {
            allComments,      // For Bottom Feed (Sab dikhana hai)
            pendingComments,  // For Action Center (Sirf pending dikhana hai)
            repliedComments ,
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
    const user = await User.findById(userId).select('+youtubeRefreshToken');
    
    // 1. CACHE CHECK (Normal Load)
    if (!forceRefresh && !pageToken && user.lastVideoSync) {
        const timeDiff = new Date() - new Date(user.lastVideoSync);
        if (timeDiff < 24 * 60 * 60 * 1000) {
            const skip = (page - 1) * limit;
            const cachedVideos = await Video.find({ user: userId }).sort({ publishedAt: -1 }).skip(skip).limit(limit);
            if (cachedVideos.length > 0) return { videos: cachedVideos, source: 'cache' };
        }
    }

    // 2. YOUTUBE API SETUP
    oauth2Client.setCredentials({ refresh_token: user.youtubeRefreshToken });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        const channelRes = await youtube.channels.list({ part: 'contentDetails', mine: true });
        const uploadsPlaylistId = channelRes.data.items[0].contentDetails.relatedPlaylists.uploads;

        let allFetchedVideos = [];
        let currentToken = pageToken || '';
        
        // 🔥 FULL SYNC LOGIC: Agar Refresh dabaya hai toh loop chala kar sab le aao
        if (forceRefresh) {
            console.log("🔄 Starting Full Channel Sync...");
            let hasNextPage = true;
            let safetyCounter = 0; // Taake quota bilkul hi khatam na ho jaye (Max 10 calls = 500 videos)

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
            // Normal batch fetch (50 items)
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

        // 🔥 1. SURGICAL PRUNING: Sirf is user ki deleted videos urao
        if (forceRefresh) {
            await Video.deleteMany({
                user: userId,
                videoId: { $nin: fetchedVideoIds } // Jo YT list me nahi hain, unhe DB se delete krdo
            });
            console.log(`🗑️ Full Pruning complete for user: ${userId}`);
        }

        // 🔥 2. BULK UPSERT
        const ops = validItems.map(item => ({
            updateOne: {
                filter: { videoId: item.snippet.resourceId.videoId, user: userId },
                update: {
                    user: userId,
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
            user.lastVideoSync = new Date();
            await user.save();
        }

        // 3. RETURN DATA
        const freshVideos = await Video.find({ user: userId }).sort({ publishedAt: -1 }).limit(limit);
        return { videos: freshVideos, nextPageToken: currentToken, source: 'api' };

    } catch (error) {
        console.error('YouTube API Error:', error);
        throw new Error('Failed to sync channel videos');
    }
};

const postReplyToComment = async (userId, commentId, replyText) => {
    // 1. User aur Token lein
    const user = await User.findById(userId).select('+youtubeRefreshToken');

    if (!user || !user.isConnectedToYoutube || !user.youtubeRefreshToken) {
        throw new Error('User is not connected to YouTube.');
    }

    // CHECK LIMIT
    if (user.repliesUsed >= user.repliesLimit) {
        throw new Error('You have reached your reply limit. Please upgrade your plan.');
    }

    // 2. Auth Credentials set karein
    oauth2Client.setCredentials({
        refresh_token: user.youtubeRefreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
        // 3. YouTube API: Comments.insert Call
        // Ye specific structure chahiye hota hai YouTube ko
        const response = await youtube.comments.insert({
            part: 'snippet',
            requestBody: {
                snippet: {
                    parentId: commentId, // Kis comment ka reply hai
                    textOriginal: replyText // Kya reply karna hai
                }
            }
        });

        // 4. Increment Count & Save
        user.repliesUsed += 1;
        await user.save();

        return {
            ...response.data,
            repliesUsed: user.repliesUsed, // Frontend ko update bhejne ke liye
            repliesLimit: user.repliesLimit
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
    // 1. Fetch user with Refresh Token
    const fullUser = await User.findById(user._id).select('+youtubeRefreshToken');

    if (!fullUser || !fullUser.youtubeRefreshToken) {
        throw new Error('YouTube account not linked properly. Please reconnect.');
    }

    // 2. Check current DB state
    const dbCount = await Comment.countDocuments({ videoId, userId: fullUser._id });

    // YouTube API Trigger Conditions:
    // - DB khali hai (First time)
    // - User "Load More" kar raha hai (pageToken mojood hai)
    // - User ne manually "Refresh" dabaya hai
    const shouldFetchFromYouTube = dbCount === 0 || pageToken || refresh;
    
    console.log("🚀 refresh: ", refresh);
    let ytNextPageToken = null;

    if (shouldFetchFromYouTube) {
        console.log(`🌐 Fetching from YouTube. Reason: ${pageToken ? 'Pagination' : refresh ? 'Manual Refresh' : 'Initial Sync'}`);
        
        oauth2Client.setCredentials({ refresh_token: fullUser.youtubeRefreshToken });
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
                            const isOwner = r.snippet.authorChannelId.value === fullUser.youtubeChannelId;
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
                                $set: { // 🔥 Use $set to only update YouTube data, preserving AI drafts
                                    userId: fullUser._id,
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

                // 4. 🔥 Update Video Meta: Store the token for this specific video
                await Video.findOneAndUpdate(
                    { videoId, user: fullUser._id }, 
                    { nextPageToken: ytNextPageToken },
                    { upsert: true }
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
        // 🔥 Get stored token from Video model so "Load More" still works in cache mode
        const videoMeta = await Video.findOne({ videoId, user: fullUser._id });
        ytNextPageToken = videoMeta?.nextPageToken;
    }

    // 5. FINAL QUERY: Fetch from DB
    // Sort logic: 1. Pending First (alphabetical P before R), 2. Newest Published First
    const comments = await Comment.find({ videoId, userId: fullUser._id })
        .sort({ status: 1, publishedAt: -1 }) 
        .limit(pageToken ? 500 : 50); // Large limit during pagination to show whole thread

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