import express from 'express';
import { authMiddleware } from './auth.js';
import { ensureConnected, TemplateConfig } from './common.js';
const router = express.Router();
router.get('/', authMiddleware, async (req, res) => {
    await ensureConnected();
    const authUser = req.authUser;
    if (!authUser) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    try {
        const template = await TemplateConfig.findOne({ uid: authUser._id.toString() }).lean();
        res.json({ configs: template?.configs ?? null });
    }
    catch (err) {
        console.error('Fetch template error', err);
        res.status(500).json({ error: err?.message || 'Failed to fetch templates' });
    }
});
router.post('/', authMiddleware, async (req, res) => {
    await ensureConnected();
    const authUser = req.authUser;
    if (!authUser) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
    }
    const configs = Array.isArray(req.body?.configs) ? req.body.configs : [];
    try {
        const template = await TemplateConfig.findOneAndUpdate({ uid: authUser._id.toString() }, { configs }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
        res.json({ configs: template?.configs ?? configs });
    }
    catch (err) {
        console.error('Save template error', err);
        res.status(500).json({ error: err?.message || 'Failed to save templates' });
    }
});
export default router;
//# sourceMappingURL=template.js.map