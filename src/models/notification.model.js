import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['crisis_alert'], // Sirf crisis ke liye
        default: 'crisis_alert'
    },
    message: { type: String, required: true }, // e.g. "Harmful comment detected"
    commentId: { type: String }, // YouTube Comment ID
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;