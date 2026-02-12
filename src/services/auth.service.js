import User from '../models/user.model.js';
import generateToken from '../utils/generateToken.js';
import admin from '../config/firebase.js';
import sendEmail from '../utils/sendEmail.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { verifyEmailTemplate, resetPasswordTemplate } from '../email-template/emailTemplate.js';

const register = async (userData) => {
    const { name, email, password, referredBy } = userData;

    const userExists = await User.findOne({ email });
    if (userExists) {
        throw new Error('User already exists');
    }
    let referrerId = null;
    if (referredBy) {
        // Database mein dhoondo ke ye code kiska hai
        const referrer = await User.findOne({ referralCode: referredBy });

        if (referrer) {
            referrerId = referrer._id; // Asli User ID mil gayi
            console.log("Referrer Found:", referrer.name);
        } else {
            console.log("Invalid Referral Code");
        }
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
        referredBy: referrerId, // 🔥 Yahan ID save hogi
        verificationOtp: hashedOtp,
        verificationOtpExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        isVerified: true
    });

    if (user) {
        // Send Email
        const message = `Your verification OTP is ${otp}. It expires in 24 hours.`;
        const html = verifyEmailTemplate(name, otp);

        // try {
        //     await sendEmail({
        //         email: user.email,
        //         subject: 'Verify Your Email - Respond Pilot Pro',
        //         message,
        //         html
        //     });
        // } catch (error) {
        //     // If email fails, we might want to delete the user or just let them resend code later.
        //     // For now, we'll log it but keep the user created so they can try "Resend OTP".
        //     console.error("Email sending failed:", error);
        // }

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

    if (!user) {
        throw new Error('User not found');
    }

    if (await user.matchPassword(password)) {
        if (!user.isVerified) {
            throw new Error('Please verify your email address');
        }

        return {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            plan: user.plan,
            repliesLimit: user.repliesLimit,
            repliesUsed: user.repliesUsed || 0,
            tone: user.tone,
            toneType: user.toneType,
            isOnboarded: user.isOnboarded,
            profileImage: user.profileImage,
            phoneNumber: user.phoneNumber,
            isConnectedToYoutube: user.isConnectedToYoutube,
            youtubeChannelName: user.youtubeChannelName,
            youtubeChannelId: user.youtubeChannelId,
            token: generateToken(user._id),
        };
    } else {
        throw new Error('Invalid credentials');
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
            repliesLimit: user.repliesLimit,
            repliesUsed: user.repliesUsed || 0,
            tone: user.tone,
            toneType: user.toneType,
            profileImage: user.profileImage,
            phoneNumber: user.phoneNumber,
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
    const html = resetPasswordTemplate(user.name, otp);

    try {
        await sendEmail({
            email: user.email,
            subject: 'Password Reset OTP',
            message,
            html
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
        // Debugging logs
        const debugUser = await User.findOne({ email: normalizedEmail });
        if (debugUser) {
            console.log("❌ Password Reset OTP Failed for:", normalizedEmail);
            console.log("   Current Time:", Date.now());
            console.log("   Expires At:", debugUser.resetPasswordOtpExpires ? debugUser.resetPasswordOtpExpires.getTime() : "NULL");
            console.log("   Is Expired?", debugUser.resetPasswordOtpExpires < Date.now());
        } else {
            console.log("❌ User not found for Password Reset:", normalizedEmail);
        }
        throw new Error('Invalid OTP or Email (Password Reset)');
    }

    const isMatch = await bcrypt.compare(otp.toString(), user.resetPasswordOtp);

    if (!isMatch) {
        console.log("❌ Invalid OTP for Password Reset:", normalizedEmail);
        throw new Error('Invalid OTP');
    }

    // Generate a temporary reset token (valid for 5 mins)
    const resetToken = jwt.sign({ id: user._id, type: 'reset' }, process.env.JWT_SECRET, { expiresIn: '5m' });

    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;
    await user.save();

    return { resetToken };
};

const resetPassword = async ({ email, newPassword }) => {
    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
        throw new Error('User not found');
    }

    // if (!user.isResetVerified) {
    //     throw new Error('Please verify OTP first');
    // }

    user.password = newPassword; // Will be hashed by pre-save hook
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;
    user.isResetVerified = false;
    await user.save();

    return { message: 'Password updated successfully' };
}


const verifyResetOtp = async ({ email, otp }) => {
    const normalizedEmail = email.toLowerCase();
    console.log("🔍 Verifying Reset OTP for:", normalizedEmail);
    console.log("🔑 Input OTP:", otp);

    // STEP 1: Sirf Email se user dhoondo (Expiry check mat lagao abhi)
    // Hum password aur otp fields explicitly mangwa rahe hain kyunke wo select: false hain
    const user = await User.findOne({ email: normalizedEmail })
        .select('+resetPasswordOtp +resetPasswordOtpExpires');

    if (!user) {
        console.log("❌ User not found with email:", normalizedEmail);
        throw new Error('User not found');
    }

    console.log("✅ User Found.");
    console.log("   - Stored Expiry:", user.resetPasswordOtpExpires);
    console.log("   - Current Time: ", new Date());
    console.log("   - Has OTP Hash? ", !!user.resetPasswordOtp);

    // STEP 2: Check karo ke OTP save hua bhi tha ya nahi?
    if (!user.resetPasswordOtp || !user.resetPasswordOtpExpires) {
        console.log("⚠️ Error: No OTP request found. Did you call /forgot-password first?");
        throw new Error('No OTP request found. Please request a new OTP.');
    }

    // STEP 3: Expiry Check
    if (user.resetPasswordOtpExpires < Date.now()) {
        console.log("⏰ Error: OTP Expired.");
        console.log("   - Difference:", user.resetPasswordOtpExpires - Date.now(), "ms");
        throw new Error('OTP has expired. Please request a new one.');
    }

    // STEP 4: Hash Match Check
    const isMatch = await bcrypt.compare(otp.toString(), user.resetPasswordOtp);
    console.log("🔐 Hash Match Result:", isMatch);

    if (!isMatch) {
        throw new Error('Invalid OTP');
    }

    // --- SUCCESS ---
    // Mark as verified but DO NOT clear OTP yet (needed for next step if no token used)
    user.isResetVerified = true;
    await user.save();

    // Generate Token for Reset Password Screen
    const resetToken = jwt.sign({ id: user._id, type: 'reset' }, process.env.JWT_SECRET, { expiresIn: '10m' });

    return { 
        message: 'OTP Verified',
        resetToken 
    };
};

const verifyEmailOtp = async ({ email, otp }) => {
    const normalizedEmail = email.toLowerCase();
    console.log("OTP", otp)
    const user = await User.findOne({
        email: normalizedEmail,
        verificationOtpExpires: { $gt: Date.now() },
    });


    console.log("Verify email otp", user)
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


    if (user.isVerified) {
        return { message: 'Email already verified' };
    }



    const isMatch = await bcrypt.compare(otp.toString(), user.verificationOtp);

    if (!isMatch) {
        throw new Error('Invalid OTP');
    }

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

    const token = generateToken(user._id);

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

    // if (user.isVerified) {
    //     throw new Error('User already verified');
    // }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Hash OTP
    const salt = await bcrypt.genSalt(10);
    user.verificationOtp = await bcrypt.hash(otp, salt);
    user.verificationOtpExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    await user.save();

    // Send Email
    const message = `Your new verification OTP is ${otp}. It expires in 24 hours.`;
    const html = verifyEmailTemplate(user.name, otp);

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

const updateToneSettings = async (userId, { tone, toneType }) => {
    const user = await User.findById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    if (tone !== undefined) {
        user.tone = tone;
    }

    if (toneType !== undefined) {
        user.toneType = toneType;
    }

    await user.save();

    return {
        message: 'Tone settings updated',
        tone: user.tone, // Return single field
        toneType: user.toneType
    };
};

const updateUserProfile = async (userId, data) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new Error('User not found');
    }

    if (data.name) user.name = data.name;
    if (data.profileImage) user.profileImage = data.profileImage;
    if (data.phoneNumber) user.phoneNumber = data.phoneNumber;

    await user.save();

    return {
        _id: user._id,
        name: user.name,
        email: user.email,
        profileImage: user.profileImage,
        phoneNumber: user.phoneNumber,
        message: 'Profile updated successfully'
    };
};

const updatePassword = async (userId, { currentPassword, newPassword }) => {
    const user = await User.findById(userId);

    if (!user) {
        throw new Error('User not found');
    }

    if (!(await user.matchPassword(currentPassword))) {
        throw new Error('Invalid current password');
    }

    user.password = newPassword;
    await user.save();

    return { message: 'Password updated successfully' };
};
 
export default {
    verifyResetOtp,
    register,
    login,
    googleLogin,
    forgotPassword,
    verifyOtp,
    resetPassword,
    verifyEmailOtp,
    resendVerificationOtp,
    updateToneSettings,
    updateUserProfile,
    updatePassword
};
