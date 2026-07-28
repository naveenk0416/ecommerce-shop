import express from 'express';
import { authMiddleware } from './auth.js';
import { ensureConnected, Feedback } from './common.js';
const router = express.Router();
router.post('/', authMiddleware, async (req, res) => {
    await ensureConnected();
    const authUser = req.authUser;
    const feedbackData = req.body || {};
    if (!authUser) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    if (!feedbackData.listingId || typeof feedbackData.rating !== 'number') {
        res.status(400).json({ error: 'Missing listingId or rating' });
        return;
    }
    try {
        const feedback = new Feedback({
            listingId: feedbackData.listingId,
            uid: authUser._id.toString(),
            rating: feedbackData.rating,
            comment: feedbackData.comment || '',
            createdAt: feedbackData.createdAt || new Date().toISOString(),
        });
        await feedback.save();
        res.json(feedback);
    }
    catch (err) {
        console.error('Save feedback error', err);
        res.status(500).json({ error: err?.message || 'Failed to save feedback' });
    }
});
export default router;
//# sourceMappingURL=feedback.js.map