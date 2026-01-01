import authService from '../services/auth.service.js';
import { registerSchema, loginSchema } from '../utils/validationSchemas.js';

const registerUser = async (req, res) => {
    try {
        const validatedData = registerSchema.parse(req.body);
        const user = await authService.register(validatedData);
        res.status(201).json(user);
    } catch (error) {
        if (error.name === 'ZodError') {
            res.status(400).json({ message: error.errors });
        } else {
            res.status(400).json({ message: error.message });
        }
    }
};

const loginUser = async (req, res) => {
    try {
        const validatedData = loginSchema.parse(req.body);
        const user = await authService.login(validatedData);
        res.json(user);
    } catch (error) {
        if (error.name === 'ZodError') {
            res.status(400).json({ message: error.errors });
        } else {
            res.status(401).json({ message: error.message });
        }
    }
};

const googleAuth = async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) {
            return res.status(400).json({ message: 'idToken is required' });
        }
        const user = await authService.googleLogin(idToken);
        res.json(user);
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) throw new Error('Email is required');
        const result = await authService.forgotPassword(email);
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) throw new Error('Email and OTP are required');
        const result = await authService.verifyOtp({ email, otp });
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) throw new Error('Reset token and new password are required');
        const result = await authService.resetPassword({ resetToken, newPassword });
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const verifyEmailOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) throw new Error('Email and OTP are required');
        const result = await authService.verifyEmailOtp({ email, otp });
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const resendVerificationOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) throw new Error('Email is required');
        const result = await authService.resendVerificationOtp(email);
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const getProfile = async (req, res) => {
    try {
        const user = req.user;
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            profileImage: user.profileImage,
            phoneNumber: user.phoneNumber,
            repliesUsed: user.repliesUsed,
            isGoogleAuth: user.isGoogleAuth,
            plan: user.plan,
            repliesLimit: user.repliesLimit,
            repliesUsed: user.repliesUsed || 0,
            isConnectedToYoutube: user.isConnectedToYoutube,
            youtubeChannelName: user.youtubeChannelName,
            youtubeChannelId: user.youtubeChannelId,
            isVerified: user.isVerified,
            tone: user.tone,
            toneType: user.toneType,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

const updateToneSettings = async (req, res) => {
    try {
        const userId = req.user._id;
        const { tone, toneType } = req.body;

        const result = await authService.updateToneSettings(userId, {
            tone,
            toneType
        });

        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateUserProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        let { name, profileImage, phoneNumber } = req.body;

        // If file was uploaded by multer, use its path
        if (req.file) {
            // Converts 'uploads\filename.jpg' -> '/uploads/filename.jpg'
            // Ensure your backend URL is prefixed on frontend or return full URL here if env available
            const filePath = req.file.path.replace(/\\/g, "/");
            // If you want relative path:
            profileImage = `/${filePath}`;

            // OR if you want full URL (better for frontend):
            // const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
            // profileImage = `${baseUrl}/${filePath}`;
        }

        const result = await authService.updateUserProfile(userId, {
            name,
            profileImage,
            phoneNumber
        });

        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export { registerUser, loginUser, googleAuth, forgotPassword, verifyOtp, resetPassword, verifyEmailOtp, resendVerificationOtp, getProfile, updateToneSettings, updateUserProfile };
