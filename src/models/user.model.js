import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
const userSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        role: {
            type: String,
            enum: ['staff', 'admin'],
            default: 'staff'
        },
        password: {
            type: String,
            required: function () { return !this.isGoogleAuth; }, // Required if not Google Auth
        },
        plan: {
            type: String,
            enum: ['Free', 'Basic', 'Pro', 'PRO_PLUS', 'Founding Partner'],
            default: 'Free'
        },
        repliesUsed: {
            type: Number,
            default: 0
        },
        isGoogleAuth: {
            type: Boolean,
            default: false,
        },
        googleId: {
            type: String,
        },
        youtubeChannelId: {
            type: String,
            default: null
        },
        youtubeChannelName: {
            type: String,
            default: null
        },
        youtubeRefreshToken: {
            type: String,
            select: false // Security: Ye default query me nahi aayega
        },
        isConnectedToYoutube: {
            type: Boolean,
            default: false
        },
        resetPasswordOtp: {
            type: String,
        },
        resetPasswordOtpExpires: {
            type: Date,
        },
        isResetVerified: {
            type: Boolean,
            default: false
        },
        verificationOtp: {
            type: String,
        },
        verificationOtpExpires: {
            type: Date,
        },
        profileImage: {
            type: String,
            default: null
        },
        phoneNumber: {
            type: String,
            default: null
        },
        repliesLimit: {
            type: Number,
            default: 50 // Free tier starts with 50
        },
        tone: {
            type: String, // Stores Custom Tone Description OR Persona Instruction
            default: null
        },
        toneType: {
            type: String,
            default: 'professional'
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        stripeCustomerId: {
            type: String,
        },
        stripeSubscriptionId: {
            type: String,
        },
        subscriptionStatus: {
            type: String,
        },
        planExpiresAt: {
            type: Date,
        },
        lastVideoSync: {
            type: Date,
            default: null
        },
        affiliateTier: {
            type: String,
            enum: ['none', 'tier1', 'tier2'],
            default: 'none'
            // 'tier1' = Founding Partner (30% comm + Free Access)
            // 'tier2' = Standard Affiliate (15% comm + Paid Access)
        },
        referralCode: {
            type: String,
            unique: true,
            sparse: true // Allows nulls to avoid unique errors if not set
        },
        referredBy: {
            type: mongoose.Schema.Types.ObjectId, // Referrer ki ID store karenge
            ref: 'User',
            default: null
        },
        walletBalance: {
            type: Number,
            default: 0
        },
        totalEarnings: { // Reporting ke liye
            type: Number,
            default: 0
        }
,
notificationSettings: {
        aiCrisisDetection: { 
            type: Boolean, 
            default: true // Default OFF rakhein (User khud ON karega agar Pro Plus hai)
        }
    },
     isOnboarded: {
            type: Boolean,
            default: false 
        },
    },
    {
        timestamps: true,
    }
);

userSchema.pre('save', async function (req,res,next) {
    // 1. Password Hash (Existing)
    if (this.isModified('password') && this.password) {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    }

    // 2. 🔥 Generate Referral Code if not exists
    if (!this.referralCode) {
        // Simple random 6 char code (e.g., 'ab12cd')
        // Aap chaho to user.name se bhi bana sakte ho
        const randomCode = crypto.randomBytes(3).toString('hex');
        this.referralCode = `${this.name ? this.name.split(' ')[0].toLowerCase() : 'user'}-${randomCode}`;
    }

    // next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
