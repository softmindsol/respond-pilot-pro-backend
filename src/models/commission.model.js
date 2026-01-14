import mongoose from 'mongoose';

const commissionSchema = new mongoose.Schema(
    {
        affiliateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        referredUserId: { // Jisne payment ki
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        orderAmount: { type: Number, required: true }, // Kitne ki subscription thi
        commissionAmount: { type: Number, required: true }, // Affiliate ko kitne mile
        commissionRate: { type: Number, required: true }, // 30% ya 15%
        tier: { 
            type: String, 
            enum: ['tier1', 'tier2'],
            required: true 
        },
        status: {
            type: String,
            enum: ['pending', 'paid'], // 'paid' tab hoga jab Admin payout karega
            default: 'pending'
        },
        stripePaymentId: { type: String } // Tracking ke liye
    },
    { timestamps: true }
);

const Commission = mongoose.model('Commission', commissionSchema);
export default Commission;