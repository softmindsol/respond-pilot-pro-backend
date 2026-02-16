import mongoose from 'mongoose';

const replyQueueSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channelId: { type: String, required: true },
    commentId: { type: String, required: true },
    replyText: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'processing', 'completed', 'failed'], 
        default: 'pending' 
    },
    attempts: { type: Number, default: 0 },
    error: { type: String },
    lastAttemptAt: { type: Date }
}, { timestamps: true });

// Index for fast queue processing
replyQueueSchema.index({ status: 1, createdAt: 1 });

export default mongoose.model('ReplyQueue', replyQueueSchema);