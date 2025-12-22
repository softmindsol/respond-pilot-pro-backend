import User from '../models/user.model.js';
import generateToken from '../utils/generateToken.js';
import admin from '../config/firebase.js';
import sendEmail from '../utils/sendEmail.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const register = async (userData) => {
    const { name, email, password } = userData;

    const userExists = await User.findOne({ email });

    if (userExists) {
        throw new Error('User already exists');
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    const hashedOtp = await bcrypt.hash(otp, salt);

    const user = await User.create({
        name,
        email: email.toLowerCase(),
        password,
        verificationOtp: hashedOtp,
        verificationOtpExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        isVerified: false
    });

    if (user) {
        // Send Email
        const message = `Your verification OTP is ${otp}. It expires in 24 hours.`;
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
                <div style="text-align: center; padding-bottom: 20px;">
                    <h1 style="color: #333;">Verify Your Email</h1>
                </div>
                <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; text-align: center;">
                    <p style="font-size: 16px; color: #555;">Hello <strong>${name}</strong>,</p>
                    <p style="font-size: 16px; color: #555;">Thank you for registering with Respond Pilot Pro. Please use the following OTP to verify your email address:</p>
                    <h2 style="font-size: 32px; color: #007bff; letter-spacing: 5px; margin: 20px 0;">${otp}</h2>
                    <p style="font-size: 14px; color: #888;">This OTP is valid for 24 hours.</p>
                </div>
                <div style="padding-top: 20px; text-align: center;">
                    <p style="font-size: 14px; color: #aaa;">If you did not request this, please ignore this email.</p>
                </div>
            </div>
        `;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Verify Your Email - Respond Pilot Pro',
                message,
                html
            });
        } catch (error) {
            // If email fails, we might want to delete the user or just let them resend code later.
            // For now, we'll log it but keep the user created so they can try "Resend OTP".
            console.error("Email sending failed:", error);
        }

        return {
            _id: user._id,
            name: user.name,
            email: user.email,
            message: 'Registration successful. Please check your email for OTP verification.',
            isVerified: user.isVerified
        };
    } else {
        throw new Error('Invalid user data');
    }
};

const login = async ({ email, password }) => {
    const user = await User.findOne({ email: email.toLowerCase() });
    console.log(user)
    if (user && (await user.matchPassword(password))) {
        if (!user.isVerified) {
            throw new Error('Please verify your email address');
        }

        return {
            _id: user._id,
            name: user.name,
            email: user.email,
            plan: user.plan,
            token: generateToken(user._id),
        };
    } else {
        throw new Error('Invalid email or password');
    }
};

const googleLogin = async (idToken) => {
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { name, email, uid } = decodedToken;

        let user = await User.findOne({ email });

        if (user) {
            if (!user.googleId) {
                user.googleId = uid;
                user.isGoogleAuth = true;
                await user.save();
            }
        } else {
            user = await User.create({
                name: name || 'User',
                email: email.toLowerCase(),
                googleId: uid,
                isGoogleAuth: true,
                isVerified: true // Google accounts are verified
            });
        }

        return {
            _id: user._id,
            name: user.name,
            email: user.email,
            plan: user.plan,
            token: generateToken(user._id),
        };
    } catch (error) {
        throw new Error('Invalid Firebase ID token: ' + error.message);
    }
};

const forgotPassword = async (email) => {
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
        throw new Error('User not found');
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP and save
    const salt = await bcrypt.genSalt(10);
    user.resetPasswordOtp = await bcrypt.hash(otp, salt);
    user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // Send Email
    const message = `Your password reset OTP is ${otp}. It expires in 10 minutes.`;

    try {
        await sendEmail({
            email: user.email,
            subject: 'Password Reset OTP',
            message,
        });
        return { message: 'Email sent' };
    } catch (error) {
        user.resetPasswordOtp = undefined;
        user.resetPasswordOtpExpires = undefined;
        await user.save();
        throw new Error('Email sending failed');
    }
};

const verifyOtp = async ({ email, otp }) => {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({
        email: normalizedEmail,
        resetPasswordOtpExpires: { $gt: Date.now() },
    });


    if (!user) {
        throw new Error('Invalid OTP or Email (Password Reset)');
    }

    const isMatch = await bcrypt.compare(otp.toString(), user.resetPasswordOtp);

    if (!isMatch) {
        throw new Error('Invalid OTP');
    }

    // Generate a temporary reset token (valid for 5 mins)
    const resetToken = jwt.sign({ id: user._id, type: 'reset' }, process.env.JWT_SECRET, { expiresIn: '5m' });

    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;
    await user.save();

    return { resetToken };
};

const resetPassword = async ({ resetToken, newPassword }) => {
    try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);

        if (decoded.type !== 'reset') {
            throw new Error('Invalid token type');
        }

        const user = await User.findById(decoded.id);
        if (!user) throw new Error('User not found');

        user.password = newPassword; // Will be hashed by pre-save hook
        await user.save();

        return { message: 'Password updated successfully' };
    } catch (error) {
        throw new Error('Invalid or expired reset token');
    }
}

const verifyEmailOtp = async ({ email, otp }) => {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({
        email: normalizedEmail,
        verificationOtpExpires: { $gt: Date.now() },
    });

    console.log("VerifyEmailOtp - Email:", normalizedEmail, "OTP:", otp);
    console.log("VerifyEmailOtp - OTP Type:", typeof otp);

    if (!user) {
        // Debugging: check if user exists at all
        const anyUser = await User.findOne({ email: normalizedEmail });
        if (!anyUser) {
            console.log("❌ User not found at all for:", normalizedEmail);
        } else {
            console.log("⚠️ User found but expired or no OTP");
            console.log("   Email:", normalizedEmail);
            console.log("   Expires:", anyUser.verificationOtpExpires);
            console.log("   Current Time:", Date.now());
            console.log("   Time Left (ms):", anyUser.verificationOtpExpires - Date.now());
            console.log("   Has OTP:", !!anyUser.verificationOtp);
            console.log("   Is Verified:", anyUser.isVerified);
        }

        throw new Error('Invalid OTP or Email, or OTP expired (Email Verification)');
    }

    console.log("✅ User found:", normalizedEmail);
    console.log("   Is Verified:", user.isVerified);

    if (user.isVerified) {
        return { message: 'Email already verified' };
    }

    console.log("🔐 Comparing OTP...");
    console.log("   Received OTP:", otp);
    console.log("   Stored Hash exists:", !!user.verificationOtp);

    const isMatch = await bcrypt.compare(otp.toString(), user.verificationOtp);

    console.log("   Match Result:", isMatch);

    if (!isMatch) {
        throw new Error('Invalid OTP');
    }

    console.log("💾 Updating user...");
    user.isVerified = true;
    user.verificationOtp = undefined;
    user.verificationOtpExpires = undefined;

    try {
        await user.save();
        console.log("✅ User saved successfully");
    } catch (saveError) {
        console.error("❌ Error saving user:", saveError.message);
        console.error("   Full Error:", saveError);
        throw new Error(`Failed to save user: ${saveError.message}`);
    }

    console.log("🎉 Generating token...");
    const token = generateToken(user._id);
    console.log("✅ Token generated successfully");

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        token: token,
        message: 'Email verified successfully'
    };
};

const resendVerificationOtp = async (email) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.isVerified) {
        throw new Error('User already verified');
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    user.verificationOtp = await bcrypt.hash(otp, salt);
    user.verificationOtpExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    await user.save();

    // Send Email
    const message = `Your new verification OTP is ${otp}. It expires in 24 hours.`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
            <div style="text-align: center; padding-bottom: 20px;">
                <h1 style="color: #333;">Verify Your Email</h1>
            </div>
            <div style="background-color: #f9f9f9; padding: 20px; border-radius: 5px; text-align: center;">
                <p style="font-size: 16px; color: #555;">Hello <strong>${user.name}</strong>,</p>
                <p style="font-size: 16px; color: #555;">Here is your new OTP to verify your email address:</p>
                <h2 style="font-size: 32px; color: #007bff; letter-spacing: 5px; margin: 20px 0;">${otp}</h2>
                <p style="font-size: 14px; color: #888;">This OTP is valid for 24 hours.</p>
            </div>
        </div>
    `;

    try {
        await sendEmail({
            email: user.email,
            subject: 'New Verification OTP - Respond Pilot Pro',
            message,
            html
        });
        return { message: 'New OTP sent to email' };
    } catch (error) {
        throw new Error('Email sending failed');
    }
};

export default {
    register,
    login,
    googleLogin,
    forgotPassword,
    verifyOtp,
    resetPassword,
    verifyEmailOtp,
    resendVerificationOtp
};
