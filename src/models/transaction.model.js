import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        stripeSessionId: { type: String, required: true },
        amount: { type: Number, required: true }, // Amount in Dollars
        currency: { type: String, default: 'usd' },
        planType: { type: String, required: true }, // Basic, Pro, etc.
        status: { 
            type: String, 
            default: 'completed',
            enum: ['completed', 'refunded', 'pending', 'failed'] 
        },
        paymentMethod: { type: String, default: 'card' }
    },
    { timestamps: true }
);

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;