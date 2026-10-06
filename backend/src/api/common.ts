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
  await Promise.all([User.init(), CoinLedger.init(), AssistCounter.init(), GstLookup.init(), CoinOrder.init(), FeatureInterest.init(), GuestDraft.init(), GuestUsage.init(), BulkValueCache.init(), BatchJob.init(), BatchItem.init(), SizeChart.init()]);
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
  // "Where do you sell?" (onboarding card / Profile → My marketplaces) — values from
  // MARKETPLACE_VALUES in utils/signup-fields.ts. Unset = never answered.
  marketplaces: { type: [String], default: undefined },
  marketplaces_other: { type: String, default: null },
  marketplaces_updated_at: { type: Date },
  /** The one-time "where do you sell?" card for existing accounts was closed without answering. */
  marketplaces_card_dismissed_at: { type: Date },
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

  // ---- Short sign-up (2026-09) ----
  /** 'email' or 'google'. Accounts created before this field existed have none. */
  signupMethod: { type: String },
  /** Google account id ("sub") for "Continue with Google". */
  googleSub: { type: String, unique: true, sparse: true },
  /** Split welcome bonus (part at sign-up, rest after verification). Unset on older accounts,
   * which keep the single 10-coin welcome after verification. */
  welcomeSplit: { type: Boolean },
  /** false when the device/network limits say this account gets no welcome coins. */
  welcomeEligible: { type: Boolean },
  welcomeBlockedReason: { type: String },
  /** Bonuses earned while the email was unverified — granted once it's verified. */
  pendingBonuses: { type: [String], default: undefined },
  /** "Tell us about your business" card. */
  businessCardDismissedAt: { type: Date },
  businessDetailsAt: { type: Date },
  verificationReminderSentAt: { type: Date },
  firstListingAt: { type: Date },

  // ---- Bulk template fill: saved once, reused in every Meesho/Flipkart file ----
  sellerProfile: {
    brand: { type: String },
    manufacturerName: { type: String },
    manufacturerAddress: { type: String },
    packerName: { type: String },
    packerAddress: { type: String },
    countryOfOrigin: { type: String },
    gstHandling: { type: String, enum: ['inclusive', 'exclusive'] },
    pickupPincode: { type: String },
  },
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
  /** The size/colour sold, for products with sizes. */
  variantId: { type: String },
  variantLabel: { type: String },
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
  /** Sizes & colours chosen before the product is in Inventory (same shape as Listing.variants). */
  variants: { type: mongoose.Schema.Types.Mixed },
  /** Size set used ("alpha", "waist", … or "custom"). */
  sizePreset: { type: String },
  /** All photos of the product (ProductImage ids); `image` stays the main photo. */
  imageIds: { type: [String], default: undefined },
  /** Created by "Add many products". */
  batchId: { type: String, index: true },
  batchItemId: { type: String },
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
  purpose: { type: String, required: true, enum: ['listing', 'field_fix', 'marketplace_autofill', 'guest_listing', 'bulk_mapping'] },
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

// "Notify me" for features that aren't live yet (e.g. flipkart_publish) — one row per seller per feature.
const featureInterestSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  feature: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
featureInterestSchema.index({ uid: 1, feature: 1 }, { unique: true });

export const FeatureInterest = (mongoose.models as any).FeatureInterest || mongoose.model('FeatureInterest', featureInterestSchema);

// "Try 1 listing free — no sign-up": the full AI result, kept for 24h behind a random token until
// the visitor signs up and claims it (it then becomes a normal ListingDraft).
const guestDraftSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  image: { type: String, default: '' },
  results: { type: mongoose.Schema.Types.Mixed, default: {} },
  deviceId: { type: String },
  ipHash: { type: String },
  claimedByUid: { type: String },
  claimedDraftId: { type: String },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, minimize: false });
guestDraftSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GuestDraft = (mongoose.models as any).GuestDraft || mongoose.model('GuestDraft', guestDraftSchema);

// Guest generation counts (kept after the 24h drafts expire) — enforces the per-device, per-IP
// and global daily caps.
const guestUsageSchema = new mongoose.Schema({
  deviceId: { type: String },
  ipHash: { type: String },
  day: { type: String, required: true },
  status: { type: String, enum: ['reserved', 'success', 'failed'], default: 'reserved' },
}, { timestamps: true });
guestUsageSchema.index({ deviceId: 1 });
guestUsageSchema.index({ ipHash: 1, day: 1 });
guestUsageSchema.index({ day: 1 });

export const GuestUsage = (mongoose.models as any).GuestUsage || mongoose.model('GuestUsage', guestUsageSchema);

// Bulk-upload templates (Meesho / Flipkart) a seller uploaded to fill. Deleted 24h after upload;
// filled files are generated on download and never stored.
const bulkTemplateSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  marketplace: { type: String, enum: ['meesho', 'flipkart'], required: true },
  fileName: { type: String },
  inputFormat: { type: String, enum: ['xlsx', 'xlsm', 'xls'], required: true },
  /** The file as uploaded (.xls is converted to .xlsx once, here). */
  data: { type: Buffer, required: true },
  parsed: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, minimize: false });
bulkTemplateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const BulkTemplate = (mongoose.models as any).BulkTemplate || mongoose.model('BulkTemplate', bulkTemplateSchema);

// Dropdown value mappings the AI made once for a template (by template hash): the same category
// template costs nothing the next time.
const bulkValueCacheSchema = new mongoose.Schema({
  templateHash: { type: String, required: true },
  column: { type: String, required: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
}, { timestamps: true });
bulkValueCacheSchema.index({ templateHash: 1, column: 1, from: 1 }, { unique: true });

export const BulkValueCache = (mongoose.models as any).BulkValueCache || mongoose.model('BulkValueCache', bulkValueCacheSchema);

// One row per generated file — never the file's contents.
const bulkFileLogSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  marketplace: { type: String },
  category: { type: String },
  rows: { type: Number },
  filledPercent: { type: Number },
  errors: { type: [String], default: undefined },
  format: { type: String },
  /** Flipkart's one-time file ID the download was made from (warns when the same template comes back). */
  feedToken: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });
bulkFileLogSchema.index({ uid: 1, feedToken: 1 }, { sparse: true });

export const BulkFileLog = (mongoose.models as any).BulkFileLog || mongoose.model('BulkFileLog', bulkFileLogSchema);

// Sign-up funnel events (landing_view → signup_view → sign_up_start → sign_up → first listing),
// keyed by the browser id so steps can be counted per visitor and per campaign.
const funnelEventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  deviceId: { type: String },
  uid: { type: String },
  utm_source: { type: String },
  utm_campaign: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });
funnelEventSchema.index({ createdAt: 1, name: 1 });

export const FunnelEvent = (mongoose.models as any).FunnelEvent || mongoose.model('FunnelEvent', funnelEventSchema);

// Suspicious sign-up patterns for the admin page (never shown to sellers).
const abuseEventSchema = new mongoose.Schema({
  type: { type: String, required: true },
  emailDomain: { type: String },
  deviceId: { type: String },
  ipHash: { type: String },
  uid: { type: String },
}, { timestamps: { createdAt: true, updatedAt: false } });
abuseEventSchema.index({ createdAt: 1, type: 1 });

export const AbuseEvent = (mongoose.models as any).AbuseEvent || mongoose.model('AbuseEvent', abuseEventSchema);

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

// A product photo (data URL), served at /api/images/:id.jpg — used for "Add many products" and
// per-colour photos of products with sizes/colours.
const productImageSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  data: { type: String, required: true },
  batchId: { type: String, index: true },
}, { timestamps: true });

export const ProductImage = (mongoose.models as any).ProductImage || mongoose.model('ProductImage', productImageSchema);

// Size chart (chest/length … per size), entered once per brand + category and reused.
const sizeChartSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  /** Normalised "brand|category". */
  key: { type: String, required: true },
  brand: { type: String, default: '' },
  category: { type: String, default: '' },
  unit: { type: String, enum: ['in', 'cm'], default: 'in' },
  /** Measurement names in column order, e.g. ["Chest", "Length"]. */
  measures: { type: [String], default: undefined },
  rows: { type: [{ size: String, values: [String] }], default: undefined },
}, { timestamps: true });
sizeChartSchema.index({ uid: 1, key: 1 }, { unique: true });

export const SizeChart = (mongoose.models as any).SizeChart || mongoose.model('SizeChart', sizeChartSchema);

// "Add many products": one job per batch of photos, one item per product. Items are generated by
// the in-process queue (batch/worker.ts) — the seller can close the page; the job keeps going.
const batchJobSchema = new mongoose.Schema({
  uid: { type: String, required: true, index: true },
  /** uploading → queued/running → done (or cancelled). paused = waiting for the AI or for coins. */
  status: { type: String, enum: ['uploading', 'queued', 'running', 'paused', 'done', 'cancelled'], default: 'uploading' },
  /** true until done/cancelled — the partial unique index allows one active batch per seller. */
  active: { type: Boolean, default: true },
  pauseReason: { type: String, enum: ['ai_busy', 'coins', null], default: null },
  pausedUntil: { type: Date },
  pauseCount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  done: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  /** Details shared by every product of the batch (category, brand, price, sizes …). */
  common: { type: mongoose.Schema.Types.Mixed, default: {} },
  /** The single-listing prompt + schema, built by the app exactly as for one photo. */
  prompt: { type: String },
  schema: { type: mongoose.Schema.Types.Mixed },
  startedAt: { type: Date },
  finishedAt: { type: Date },
  /** The seller opened the review screen after it finished (clears the "done" badge). */
  seenAt: { type: Date },
}, { timestamps: true, minimize: false });
batchJobSchema.index({ uid: 1 }, { unique: true, partialFilterExpression: { active: true }, name: 'one_active_batch' });

export const BatchJob = (mongoose.models as any).BatchJob || mongoose.model('BatchJob', batchJobSchema);

const batchItemSchema = new mongoose.Schema({
  batchId: { type: String, required: true },
  uid: { type: String, required: true },
  index: { type: Number, required: true },
  /** ProductImage ids; the first is the main photo. */
  photoIds: { type: [String], default: [] },
  photoCount: { type: Number, default: 1 },
  status: { type: String, enum: ['uploading', 'queued', 'generating', 'ready', 'failed'], default: 'uploading' },
  error: { type: String },
  /** Gemini attempts (including automatic retries). */
  attempts: { type: Number, default: 0 },
  /** The coin for this product was taken (only ever once, only on success). */
  coin_charged: { type: Boolean, default: false },
  /** The listing draft created for this product (My Listings). */
  listing_id: { type: String },
  /** AI colour name per photo (same order as photoIds). */
  colours: { type: [String], default: undefined },
  lockedAt: { type: Date },
  finishedAt: { type: Date },
  approvedAt: { type: Date },
  inventoryListingId: { type: String },
}, { timestamps: true });
batchItemSchema.index({ batchId: 1, index: 1 }, { unique: true });
batchItemSchema.index({ status: 1, lockedAt: 1 });

export const BatchItem = (mongoose.models as any).BatchItem || mongoose.model('BatchItem', batchItemSchema);
