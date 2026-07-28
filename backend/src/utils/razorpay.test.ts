import test from 'node:test';
import assert from 'node:assert/strict';
import { createRazorpaySignature } from './razorpay.js';

test('createRazorpaySignature generates the expected HMAC signature', () => {
  const signature = createRazorpaySignature('order_test_123', 'pay_test_456', 'secret_test_789');
  assert.equal(signature, '01f19815414c9f8d28e6dac552836d6a6c783ac8d95c69039e85ec0860576589');
});
