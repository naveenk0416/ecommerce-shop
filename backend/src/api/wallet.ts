import express from 'express';
import Razorpay from 'razorpay';
import '../utils/env.js';
import { authMiddleware } from './auth.js';
import { CoinLedger, CoinOrder, ensureConnected, PackInterest, User } from './common.js';
import { activeFestivePacks, coinConfig, type CoinPack } from '../config/coins.js';
import { verifyRazorpaySignature } from '../utils/razorpay.js';
import { credit, ensureWallet, walletSummary } from '../utils/wallet.js';

const router = express.Router();

function uidOf(req: express.Request): string {
  return (req as any).authUser._id.toString();
}

type OrderCreator = (amountPaise: number, receipt: string, notes: Record<string, string>) => Promise<{ id: string; amount: number; currency: string }>;

const realOrderCreator: OrderCreator = async (amount, receipt, notes) => {
  const razorpay = new Razorpay({
    key_id: process.env['RAZORPAY_KEY_ID'] || '',
    key_secret: process.env['RAZORPAY_KEY_SECRET'] || '',
  });
  const order = await razorpay.orders.create({ amount, currency: 'INR', receipt, notes });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
};

let createOrder: OrderCreator = realOrderCreator;

/** Tests replace the Razorpay API call. */
export function setOrderCreatorForTests(fn: OrderCreator | null): void {
  createOrder = fn ?? realOrderCreator;
}

router.get('/', authMiddleware, async (req, res) => {
  await ensureConnected();
  res.json(await walletSummary(uidOf(req)));
});

/** "Notify me when coin packs launch" — every click is recorded with the balance at the time. */
router.post('/notify-me', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const user = await User.findById(uid).select('coins').lean();
  await PackInterest.create({ uid, balance: (user?.coins?.free ?? 0) + (user?.coins?.paid ?? 0) });
  res.json({ ok: true });
});

/** "How many products do you sell?" for accounts created before the sign-up question existed. */
router.post('/catalog-size', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const { band, dismiss } = req.body || {};
  if (dismiss === true) {
    await User.updateOne({ _id: uid }, { $set: { catalogPromptDismissedAt: new Date() } });
    res.json({ ok: true });
    return;
  }
  if (!coinConfig.catalogSizeBands.includes(band)) {
    res.status(400).json({ error: 'Choose how many products you sell.' });
    return;
  }
  await User.updateOne({ _id: uid }, { $set: { catalogSizeBand: band, catalogPromptDismissedAt: new Date() } });
  res.json({ ok: true });
});

/** The pack a seller may buy right now, or an error message. Prices always come from config. */
async function resolvePack(uid: string, packId: string): Promise<{ pack: CoinPack; starter: boolean } | { error: string; status: number }> {
  if (!coinConfig.packs.enabled) return { error: 'Coin packs are not available yet.', status: 403 };
  const starter = coinConfig.packs.starter;
  if (packId === starter.id) {
    const user = await User.findById(uid).select('hasPurchased offerExpiresAt').lean();
    const alreadyBought = await CoinLedger.exists({ uid, key: 'purchase:starter' });
    if (alreadyBought || user?.hasPurchased) return { error: 'The starter pack is only for your first purchase.', status: 409 };
    if (!user?.offerExpiresAt || new Date(user.offerExpiresAt).getTime() <= Date.now()) {
      return { error: 'This offer has expired.', status: 410 };
    }
    return { pack: starter, starter: true };
  }
  const pack = [...coinConfig.packs.regular, ...activeFestivePacks()].find((p) => p.id === packId);
  if (!pack) return { error: 'This pack is not available.', status: 404 };
  return { pack, starter: false };
}

router.post('/packs/:id/order', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const resolved = await resolvePack(uid, String(req.params['id']));
  if ('error' in resolved) {
    res.status(resolved.status).json({ error: resolved.error });
    return;
  }
  const { pack } = resolved;
  try {
    const order = await createOrder(Math.round(pack.priceInr * 100), `coins-${uid.slice(-8)}-${Date.now()}`, { uid, packId: pack.id });
    await CoinOrder.create({ uid, packId: pack.id, packName: pack.name, coins: pack.coins, amountInr: pack.priceInr, orderId: order.id });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env['RAZORPAY_KEY_ID'] || '',
      pack: { id: pack.id, name: pack.name, coins: pack.coins, priceInr: pack.priceInr },
    });
  } catch (err: any) {
    console.error('Coin pack order failed', err?.message || err);
    res.status(502).json({ error: 'Could not start the payment. Please try again.' });
  }
});

/** Razorpay checkout success → verify the signature, then credit the coins exactly once. */
router.post('/packs/verify', authMiddleware, async (req, res) => {
  await ensureConnected();
  const uid = uidOf(req);
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
  if (!orderId || !paymentId || !signature) {
    res.status(400).json({ error: 'Missing payment details.' });
    return;
  }
  if (!verifyRazorpaySignature(String(orderId), String(paymentId), String(signature), process.env['RAZORPAY_KEY_SECRET'] || '')) {
    res.status(400).json({ error: 'Payment could not be verified.' });
    return;
  }

  const order = await CoinOrder.findOneAndUpdate(
    { orderId, uid, status: 'created' },
    { $set: { status: 'paid', paymentId, paidAt: new Date() } },
    { new: true },
  );
  if (!order) {
    const existing = await CoinOrder.findOne({ orderId, uid }).lean();
    if (existing?.status === 'paid') {
      res.json({ ok: true, alreadyCredited: true, wallet: await walletSummary(uid) });
      return;
    }
    res.status(404).json({ error: 'Order not found.' });
    return;
  }

  await ensureWallet(uid);
  const isStarter = order.packId === coinConfig.packs.starter.id;
  const credited = await credit(uid, {
    type: 'purchase',
    amount: order.coins,
    bucket: 'paid',
    reason: `Bought ${order.packName || order.packId} (₹${order.amountInr})`,
    // The starter pack's key is per user, so a second starter payment can never add coins.
    key: isStarter ? 'purchase:starter' : `purchase:order:${orderId}`,
    meta: { orderId, paymentId, packId: order.packId, amountInr: order.amountInr },
  });
  if (!credited) {
    await CoinOrder.updateOne({ _id: order._id }, { $set: { status: 'rejected', note: 'Duplicate starter pack — refund this payment in Razorpay.' } });
    console.error(`[wallet] Duplicate starter pack payment ${paymentId} for ${uid} — refund needed`);
    res.status(409).json({ error: 'The starter pack can only be bought once. Your payment will be refunded.' });
    return;
  }
  await User.updateOne({ _id: uid }, { $set: { hasPurchased: true }, $min: { firstPurchaseAt: new Date() } });
  res.json({ ok: true, wallet: await walletSummary(uid) });
});

export default router;
