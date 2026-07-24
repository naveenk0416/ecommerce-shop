import express from 'express';
import '../utils/env';
import Razorpay from 'razorpay';
import { verifyRazorpaySignature } from '../utils/razorpay';

const router = express.Router();

function getRazorpayClient() {
  return new Razorpay({
    key_id: process.env['RAZORPAY_KEY_ID'] || '',
    key_secret: process.env['RAZORPAY_KEY_SECRET'] || '',
  });
}

router.post('/create-order', async (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const currency = String(req.body?.currency || 'INR');
    const receipt = String(req.body?.receipt || 'sellassist-checkout');

    if (!Number.isFinite(amount) || amount < 100) {
      res.status(400).json({ error: 'Amount must be at least 100 paise.' });
      return;
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: Math.round(amount),
      currency,
      receipt,
    });

    res.json({
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (error: any) {
    console.error('Razorpay create-order failed', error?.message || error);

    if (error?.statusCode === 401) {
      res.status(401).json({ error: 'Razorpay authentication failed.' });
      return;
    }

    res.status(500).json({ error: 'Unable to create Razorpay order.' });
  }
});

router.post('/verify-payment', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      res.status(400).json({ error: 'Missing payment verification fields.' });
      return;
    }

    const keySecret = process.env['RAZORPAY_KEY_SECRET'] || '';
    const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, keySecret);

    if (!isValid) {
      res.status(400).json({ error: 'Payment signature verification failed.' });
      return;
    }

    res.json({ ok: true, message: 'Payment verified successfully.' });
  } catch (error: any) {
    console.error('Razorpay verify-payment failed', error?.message || error);
    res.status(500).json({ error: 'Unable to verify payment.' });
  }
});

export default router;
