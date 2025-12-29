import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from the token
            req.user = await User.findById(decoded.id).select('-password');

            // 👇 SAFETY CHECK: Agar token sahi hai lekin user DB se delete ho gaya hai
            if (!req.user) {
                return res.status(401).json({ message: 'User not found' });
            }

            next();
        } catch (error) {
            console.error("Token Verification Failed:", error);
            // 👇 RETURN ZAROORI HAI taake code yahin ruk jaye
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    } else {
        // Agar header hi nahi hai
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

export { protect };