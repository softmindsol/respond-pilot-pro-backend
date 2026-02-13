import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    youtubeChannelId: { type: String, required: true },
    youtubeChannelName: { type: String, required: true },
    youtubeRefreshToken: { type: String, required: true }, // Auth token moved here
    authorAvatar: { type: String }, // Channel icon
    
    // Status to track which channel the user is currently viewing
    isActive: { type: Boolean, default: false },
    
    lastVideoSync: { type: Date, default: null },
    nextPageToken: { type: String, default: null },
    isTrialClaimed: { type: Boolean, default: false } // Is channel ne kabhi 50 free credits liye hain?

}, { timestamps: true });

// Ensure a user doesn't link the same channel twice
channelSchema.index({ user: 1, youtubeChannelId: 1 }, { unique: true });

const Channel = mongoose.model('Channel', channelSchema);
export default Channel;