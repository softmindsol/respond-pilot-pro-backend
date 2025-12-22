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

export { registerUser, loginUser, googleAuth, forgotPassword, verifyOtp, resetPassword, verifyEmailOtp, resendVerificationOtp };
