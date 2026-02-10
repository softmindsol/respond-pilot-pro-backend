import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    commentId: { type: String, required: true, unique: true },
    videoId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    authorName: String,
    authorAvatar: String,
    text: String,
    replies: { type: Array, default: [] }, 
    status: { type: String, enum: ['Pending', 'Replied', 'Flagged'], default: 'Pending', index: true },
    publishedAt: { type: Date, index: true },
    // For automatic cleanup: index expires documents after 30 days
    // Logic: We only apply this to 'Replied' status via code or a background task
    lastSyncedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index: Fetch pending comments for a specific video, newest first
commentSchema.index({ userId: 1, videoId: 1, status: 1, publishedAt: -1 });

export default mongoose.model('Comment', commentSchema);