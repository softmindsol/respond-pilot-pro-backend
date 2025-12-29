import geminiService from '../services/gemini.service.js';

const generateReply = async (req, res) => {
    try {
        const { commentText, tone } = req.body;

        if (!commentText) {
            return res.status(400).json({ message: 'Comment text is required' });
        }

        const reply = await geminiService.generateReply(commentText, tone);
        res.json({ reply });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export default {
    generateReply
};
