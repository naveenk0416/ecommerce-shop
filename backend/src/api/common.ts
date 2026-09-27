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
  // The wallet's "exactly once" guarantees rely on these unique indexes existing before the
  // first write, so wait for them instead of letting autoIndex build them in the background.
  await Promise.all([User.init(), CoinLedger.init(), AssistCounter.init(), GstLookup.init(), CoinOrder.init()]);
  connected = true;
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String },
  phoneNumber: { type: String, unique: true, sparse: true },
  gstNumber: { type: String },
  state: { type: String },
  city: { type: String },
  sellsOn: { type: [String], default: undefined },
  termsAcceptedAt: { type: Date },
  // Explicit WhatsApp marketing/alerts consent — a phone number on its own is not consent.
  whatsapp_opt_in: { type: Boolean },
  whatsapp_opt_in_at: { type: Date },
  verificationEmailSentAt: { type: Date },
  signupAt: { type: Date },
  // First-touch campaign attribution captured on the landing URL (e.g. utm_campaign=surat_hindi).
  attribution: {
    utm_source: { type: String },
    utm_medium: { type: String },
    utm_campaign: { type: String },
    utm_content: { type: String },
    fbclid: { type: String },
    /** Referral code from a sellassist.in/?ref=CODE link. */
    ref: { type: String },
    landingPath: { type: String },
    capturedAt: { type: String },
  },
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

  // ---- Coin wallet (see utils/wallet.ts; every change is also a CoinLedger row) ----
  coins: {
    free: { type: Number, default: 0 },
    paid: { type: Number, default: 0 },
  },
  walletInitAt: { type: Date },
  /** "2026-09" — month (Asia/Kolkata) whose free top-up has already been applied. */
  lastTopupMonth: { type: String },
  hasPurchased: { type: Boolean, default: false },
  firstPurchaseAt: { type: Date },
  /** First-purchase (starter pack) offer window, started when the balance first hits 0. */
  offerStartedAt: { type: Date },
  offerExpiresAt: { type: Date },
  /** First time the free balance was fully used up. */
  freeExhaustedAt: { type: Date },

  // ---- Referrals ----
  referralCode: { type: String, unique: true, sparse: true },
  referral: {
    referrerUid: { type: String },
    code: { type: String },
    status: { type: String, enum: ['pending', 'rewarded', 'blocked', 'reversed'] },
    reason: { type: String },
    rewardedAt: { type: Date },
    referrerRewarded: { type: Boolean },
  },
  /** Salted hashes of IPs / random browser ids seen for this account — used only to stop
   * self-referrals from the same device or network. */
  signupIpHash: { type: String },
  signupDeviceId: { type: String },
  ipHashes: { type: [String], default: undefined },
  deviceIds: { type: [String], default: undefined },
  /** Days (Asia/Kolkata, "2026-09-27") the account used the app — for retention stats. */
  activeDays: { type: [String], default: undefined },

  // ---- Seller size ----
  catalogSizeBand: { type: String },
  catalogPromptDismissedAt: { type: Date },
  catalogSizeImported: { type: Number },
  catalogSizeImportedAt: { type: Date },
  catalogSizeImportedFrom: { type: String },
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

// An AI-generated listing (every marketplace tab + the seller's edits), saved automatically so a
// refresh or back/forward doesn't lose it. "My Listings" is the list of these. Saving to inventory
// creates/updates a Listing (inventory item) linked both ways via inventoryListingId / draftId.
const listingDraftSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  title: { type: String, default: '' },
  status: { type: String, enum: ['draft', 'saved'], default: 'draft' },
  /** Primary product photo as a data URL (served at /api/drafts/:id/image.jpg). */
  image: { type: String, default: '' },
  /** Per-tab generated content keyed by tab (general, amazon, flipkart, meesho, instagram). */
  results: { type: mongoose.Schema.Types.Mixed, default: {} },
  inventoryListingId: { type: String },
}, { timestamps: true, minimize: false });

export const ListingDraft = (mongoose.models as any).ListingDraft || mongoose.model('ListingDraft', listingDraftSchema);

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

// Every coin movement. `key` makes one-time grants idempotent: the unique {uid, key} index is
// what guarantees "welcome", "bonus:mobile", "topup:2026-10", "purchase:starter" … happen once.
const coinLedgerSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ['welcome_bonus', 'monthly_topup', 'earned_bonus', 'referral', 'referral_reversal', 'spend', 'refund', 'purchase', 'admin_adjust'],
  },
  /** + credit, − debit, in coins. */
  amount: { type: Number, required: true },
  /** How the amount splits across the free and paid balances. */
  free: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  reason: { type: String, default: '' },
  key: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  balanceAfter: { free: Number, paid: Number },
}, { timestamps: true });

coinLedgerSchema.index({ uid: 1, key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });

export const CoinLedger = (mongoose.models as any).CoinLedger || mongoose.model('CoinLedger', coinLedgerSchema);

// One row per Gemini call made by the backend — drives coin refunds, free-assist limits,
// "time saved" and the admin AI cost page.
const aiUsageSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  purpose: { type: String, required: true, enum: ['listing', 'field_fix', 'marketplace_autofill'] },
  model: { type: String },
  success: { type: Boolean, default: false },
  inputTokens: { type: Number, default: 0 },
  outputTokens: { type: Number, default: 0 },
  costInr: { type: Number, default: 0 },
  coinsCharged: { type: Number, default: 0 },
  /** How long the Gemini call took. */
  durationMs: { type: Number },
  listingKey: { type: String },
  marketplace: { type: String },
  error: { type: String },
}, { timestamps: true });

aiUsageSchema.index({ purpose: 1, createdAt: 1 });

export const AiUsage = (mongoose.models as any).AiUsage || mongoose.model('AiUsage', aiUsageSchema);

// Atomic counters for the free AI assists (per listing, per listing+marketplace, per day).
const assistCounterSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  scope: { type: String, required: true },
  count: { type: Number, default: 0 },
}, { timestamps: true });

assistCounterSchema.index({ uid: 1, scope: 1 }, { unique: true });

export const AssistCounter = (mongoose.models as any).AssistCounter || mongoose.model('AssistCounter', assistCounterSchema);

// A Razorpay order for a coin pack. Coins are credited once, when the payment signature verifies.
const coinOrderSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  packId: { type: String, required: true },
  packName: { type: String },
  coins: { type: Number, required: true },
  amountInr: { type: Number, required: true },
  orderId: { type: String, required: true, unique: true },
  paymentId: { type: String },
  status: { type: String, enum: ['created', 'paid', 'rejected'], default: 'created' },
  paidAt: { type: Date },
  note: { type: String },
}, { timestamps: true });

export const CoinOrder = (mongoose.models as any).CoinOrder || mongoose.model('CoinOrder', coinOrderSchema);

// "Notify me when coin packs launch" clicks.
const packInterestSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  balance: { type: Number, default: 0 },
}, { timestamps: true });

export const PackInterest = (mongoose.models as any).PackInterest || mongoose.model('PackInterest', packInterestSchema);

// GST rate lookups by signed-in sellers, one row per HSN per day — for "time saved".
const gstLookupSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  hsn: { type: String, required: true },
  day: { type: String, required: true },
}, { timestamps: true });

gstLookupSchema.index({ uid: 1, hsn: 1, day: 1 }, { unique: true });

export const GstLookup = (mongoose.models as any).GstLookup || mongoose.model('GstLookup', gstLookupSchema);

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
