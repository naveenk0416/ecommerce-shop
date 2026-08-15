import '../utils/env.js';
import mongoose from 'mongoose';

let connected = false;
export async function ensureConnected() {
  if (connected) return;

  const mongoUri = process.env['MONGO_URI']?.trim();
  if (!mongoUri) {
    throw new Error('MONGO_URI is not configured. Set it in the backend .env file to use database-backed auth routes.');
  }

  await mongoose.connect(mongoUri, { autoIndex: true });
  connected = true;
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String },
  phoneNumber: { type: String, unique: true, sparse: true },
  gstNumber: { type: String },
  role: { type: String, default: 'FREE' },
  usageCount: { type: Number, default: 0 },
  dailyStats: {
    date: { type: String },
    count: { type: Number, default: 0 },
  },
  lastLogin: { type: String },
  resetPasswordTokenHash: { type: String },
  resetPasswordExpires: { type: Date },
  emailVerified: { type: Boolean, default: false },
  emailVerificationTokenHash: { type: String },
  emailVerificationExpires: { type: Date },
}, { timestamps: true });

export const User = (mongoose.models as any).User || mongoose.model('User', userSchema);

const listingSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  originalImage: { type: String, default: '' },
  processedImage: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { strict: false, timestamps: true });

export const Listing = (mongoose.models as any).Listing || mongoose.model('Listing', listingSchema);

const saleSchema = new mongoose.Schema({
  listingId: { type: String, required: true },
  uid: { type: String, required: true },
  platform: { type: String, default: 'Other' },
  quantity: { type: Number, default: 0 },
  salePrice: { type: Number, default: 0 },
  date: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

export const Sale = (mongoose.models as any).Sale || mongoose.model('Sale', saleSchema);

const feedbackSchema = new mongoose.Schema({
  listingId: { type: String, required: true },
  uid: { type: String, required: true },
  rating: { type: Number, default: 0 },
  comment: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: true });

export const Feedback = (mongoose.models as any).Feedback || mongoose.model('Feedback', feedbackSchema);

const templateSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  configs: { type: Array, default: [] },
}, { timestamps: true });

export const TemplateConfig = (mongoose.models as any).TemplateConfig || mongoose.model('TemplateConfig', templateSchema);

const marketplaceConnectionSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  marketplace: { type: String, required: true, enum: ['amazon', 'flipkart'] },
  // 'revoked' = the seller pulled authorization on Amazon's side (or the refresh token
  // otherwise stopped working) — distinct from 'disconnected', which is a seller-initiated
  // action on our side. Surfaced to the frontend so it can prompt reconnection specifically.
  status: { type: String, default: 'connected', enum: ['connected', 'disconnected', 'revoked'] },
  // Amazon: the seller's Selling Partner ID, returned on the OAuth callback.
  sellingPartnerId: { type: String },
  // Restricted-classification — encrypted at rest (see utils/token-crypto.ts), never returned
  // to the frontend as-is. See docs/security/05-data-protection-policy.md and 07-api-security-policy.md.
  refreshTokenEnc: { type: String },
  accessTokenEnc: { type: String },
  accessTokenExpiresAt: { type: Date },
  scopes: { type: [String], default: [] },
  region: { type: String },
  connectedAt: { type: Date },
  disconnectedAt: { type: Date },
  revokedAt: { type: Date },
}, { timestamps: true });

marketplaceConnectionSchema.index({ uid: 1, marketplace: 1 }, { unique: true });

export const MarketplaceConnection = (mongoose.models as any).MarketplaceConnection
  || mongoose.model('MarketplaceConnection', marketplaceConnectionSchema);

// Backs the OAuth `state` parameter for both entry points of Amazon's Website Authorization
// Workflow (seller-initiated via /amazon/connect, and Amazon-initiated via /amazon/login).
// Mongo's TTL index is the direct equivalent of a Firestore TTL policy — expired documents are
// removed automatically by a background sweep (typically within ~60s of expiresAt), independent
// of the explicit expiresAt/used checks the routes also perform at read time.
const amazonAuthStateSchema = new mongoose.Schema({
  state: { type: String, required: true, unique: true },
  uid: { type: String, required: true },
  createdAt: { type: Date, required: true, default: () => new Date() },
  expiresAt: { type: Date, required: true },
  used: { type: Boolean, default: false },
});

amazonAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AmazonAuthState = (mongoose.models as any).AmazonAuthState
  || mongoose.model('AmazonAuthState', amazonAuthStateSchema);
