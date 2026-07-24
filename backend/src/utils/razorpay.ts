import crypto from 'node:crypto';

export function createRazorpaySignature(orderId: string, paymentId: string, keySecret: string) {
  return crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, receivedSignature: string, keySecret: string) {
  const expectedSignature = createRazorpaySignature(orderId, paymentId, keySecret);
  const receivedBuffer = Buffer.from(receivedSignature || '', 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
