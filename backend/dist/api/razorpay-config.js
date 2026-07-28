import express from 'express';
const router = express.Router();
router.get('/razorpay-config', (_req, res) => {
    res.json({
        key_id: process.env['RAZORPAY_KEY_ID'] || '',
    });
});
export default router;
//# sourceMappingURL=razorpay-config.js.map