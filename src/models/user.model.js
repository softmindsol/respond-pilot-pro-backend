import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
        password: {
            type: String,
            required: function () { return !this.isGoogleAuth; }, // Required if not Google Auth
        },
        plan: {
            type: String,
            enum: ['Free', 'Basic', 'Pro', 'PRO_PLUS'],
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
        verificationOtp: {
            type: String,
        },
        verificationOtpExpires: {
            type: Date,
        },
        repliesLimit: {
            type: Number,
            default: 50 // Free tier starts with 50
        },
        tone: {
            type: String, // Stores Custom Tone Description OR Persona Instruction
            default: null
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
        }
    },
    {
        timestamps: true,
    }
);

userSchema.pre('save', async function (next) {
    if (!this.isModified('password') || !this.password) {
        return;
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
