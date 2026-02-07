import Comment from '../models/comment.model.js';

export const pruneOldComments = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Delete comments that are Replied AND older than 30 days
    const result = await Comment.deleteMany({
        status: 'Replied',
        updatedAt: { $lt: thirtyDaysAgo }
    });
    
    console.log(`🧹 Cleaned up ${result.deletedCount} old replied comments.`);
};