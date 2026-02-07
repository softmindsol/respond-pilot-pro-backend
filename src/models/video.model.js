import mongoose from 'mongoose';

const videoSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    videoId: { type: String, required: true, unique: true }, // YouTube Video ID
    title: { type: String },
    thumbnail: { type: String },
    publishedAt: { type: Date },
        nextPageToken: { type: String, default: null } 

}, { timestamps: true });

// Indexing for faster queries
videoSchema.index({ user: 1, videoId: 1 }, { unique: true });

// Fast sorting for dashboard
videoSchema.index({ user: 1, publishedAt: -1 });
const Video = mongoose.model('Video', videoSchema);
export default Video;