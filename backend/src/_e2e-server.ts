// TEMPORARY e2e server (deleted after testing): in-memory MongoDB, REAL Gemini (key from backend/.env),
// no mail, a test account with no marketplace connections.
import './utils/env.js';
import express from 'express';
import crypto from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';

const mongo = await MongoMemoryServer.create();
process.env['MONGO_URI'] = mongo.getUri();
process.env['VERCEL'] = '1';
process.env['JWT_SECRET'] = 'e2e-secret';
process.env['RESEND_API_KEY'] = '';
process.env['COIN_PACKS_ENABLED'] = 'false';
process.env['TRUST_PROXY'] = '';
// Simulates production's leftover Render BACKEND_URL: image links must still use our own domain.
process.env['BACKEND_URL'] = 'https://ecommerce-shop-dins.onrender.com';
process.env['PUBLIC_API_URL'] = 'http://127.0.0.1:4996';

const common = await import('./api/common.js');
await common.ensureConnected();
const mongoose = (await import('mongoose')).default;
if (!/^(127\.0\.0\.1|localhost)$/.test(mongoose.connection.host)) throw new Error('non-local DB');
const bcrypt = (await import('bcryptjs')).default;

await new common.User({
  email: 'speed@example.com', passwordHash: await bcrypt.hash('Str0ng!Pass', 8), displayName: 'Speed Tester',
  phoneNumber: '+919000000009', state: 'Telangana', city: 'Hyderabad', emailVerified: true, signupAt: new Date(), catalogSizeBand: '11-50',
}).save();

const app = (await import('./server.js')).default;
const outer = express();
outer.use('/__test', express.json());
outer.post('/__test/coins', async (req, res) => {
  await common.User.updateOne({ email: req.body.email }, { $set: { 'coins.free': req.body.free ?? 0, 'coins.paid': req.body.paid ?? 0 } });
  res.json({ ok: true });
});
outer.get('/__test/ai-usage', async (_req, res) => res.json(await common.AiUsage.find().sort({ createdAt: 1 }).lean()));
outer.use(app);
outer.listen(4996, '127.0.0.1', () => console.log('e2e backend (real Gemini) on 4996'));
void crypto;
