import crypto from 'node:crypto';
export function createRazorpaySignature(orderId, paymentId, keySecret) {
    return crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
}
export function verifyRazorpaySignature(orderId, paymentId, receivedSignature, keySecret) {
    const expectedSignature = createRazorpaySignature(orderId, paymentId, keySecret);
    const receivedBuffer = Buffer.from(receivedSignature || '', 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    if (receivedBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}
//# sourceMappingURL=razorpay.js.map