import User from "../models/user.model.js";

// User khud Affiliate banna chahta hai (Tier 2)
export const joinAffiliateProgram = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        // Agar pehle se Tier 1 hai, to downgrade mat karo
        if (user.affiliateTier === 'tier1') {
            return res.status(400).json({ message: "You are already a Founding Partner (Tier 1)!" });
        }

        // Agar pehle se Tier 2 hai
        if (user.affiliateTier === 'tier2') {
            return res.status(200).json({ message: "You are already an affiliate." });
        }

        // Update to Tier 2
        user.affiliateTier = 'tier2';
        await user.save(); // Pre-save hook khud hi Referral Code generate kar dega (jo humne model mein lagaya tha)

        res.json({
            success: true,
            message: "Welcome to the Affiliate Program! You can now earn 15% commission.",
            user: {
                affiliateTier: user.affiliateTier,
                referralCode: user.referralCode
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};