import '../utils/env';
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
