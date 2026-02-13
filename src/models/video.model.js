import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
    channel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Channel',
        required: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    videoId: { type: String, required: true }, // Not unique globally anymore, unique per channel ideally (but YT IDs are global)
    title: { type: String },
    thumbnail: { type: String },
    publishedAt: { type: Date },
        nextPageToken: { type: String, default: null } 

}, { timestamps: true });

// Indexing for faster queries (Unique per channel just to be safe, though YT IDs are global)
videoSchema.index({ channel: 1, videoId: 1 }, { unique: true });

// Fast sorting for dashboard (Active Channel Feed)
videoSchema.index({ channel: 1, publishedAt: -1 });
const Video = mongoose.model('Video', videoSchema);
export default Video; 