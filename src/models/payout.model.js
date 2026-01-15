import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema(
    {
        affiliateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        amount: { type: Number, required: true }, // Kitne paise diye
        method: { type: String, default: 'Manual' }, // Bank, PayPal etc
        status: { type: String, default: 'Completed' },
        processedBy: { // Admin ID
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    { timestamps: true }
);

const Payout = mongoose.model('Payout', payoutSchema);
export default Payout;