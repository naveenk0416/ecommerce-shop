import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { AmazonAuthState, AssistCounter, CoinLedger, ensureConnected, Feedback, GstLookup, Listing, ListingDraft, MarketplaceConnection, PackInterest, Sale, TemplateConfig, User } from './common.js';
import { MAIL_UNAVAILABLE_MESSAGE, MailDeliveryError, sendMail } from '../utils/mailer.js';
import { GSTIN_RE, INDIAN_STATES_AND_UTS, SELLING_CHANNELS, phoneLookupValues, sanitizeAttribution, toIndianE164 } from '../utils/signup-fields.js';
import { coinConfig, dayKey } from '../config/coins.js';
import { deviceId, ipHash } from '../utils/request-identity.js';
import { ensureWallet, grantBonus, reverseReferralOnDelete } from '../utils/wallet.js';
import { setCoinBalanceHeader } from '../utils/coin-header.js';

const router = express.Router();
const JWT_SECRET = process.env['JWT_SECRET'] || 'dev_jwt_secret_change_me';

// Keyed on IP + email together (not IP alone) so one abusive IP can't lock out every account
// behind a shared NAT/office network, and one targeted account can't be brute-forced from many IPs.
// IPv6 addresses are normalized to their /56 subnet via ipKeyGenerator — using the raw address
// would let an attacker bypass the limit just by requesting a new address from their ISP's pool.
function loginRateKey(req: express.Request): string {
  const email = String(req.body?.email || '').toLowerCase().trim();
  return `${ipKeyGenerator(req.ip || '')}:${email}`;
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginRateKey,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this network. Please try again later.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginRateKey,
  message: { error: 'Too many reset requests. Please wait 15 minutes and try again.' },
});

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: loginRateKey,
  message: { error: 'Too many verification requests. Please wait 15 minutes and try again.' },
});

const accountChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function passwordPolicyError(password: string): string | null {
  if (!STRONG_PASSWORD_RE.test(password)) {
    return 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
  }
  return null;
}

/** Minimum gap between verification emails to the same account. */
const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Base URL for links in emails. FRONTEND_URL can be a comma-separated list (it doubles as the
 * CORS allow-list), so only its first entry is used — pasting the whole list produced broken
 * links like "https://sellassist.in,https://www.sellassist.in/verify-email?token=...".
 */
function appBaseUrl(): string {
  const configured = process.env['PUBLIC_APP_URL'] || (process.env['FRONTEND_URL'] || 'http://localhost:4200').split(',')[0];
  return configured.trim().replace(/\/$/, '');
}

function signToken(user: any) {
  return jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

/** Generates a fresh verification token, stores its hash (24h expiry) on `user`, and emails the
 * link. Caller is responsible for saving `user` if it hasn't been saved already. */
async function sendVerificationEmail(user: any): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  user.verificationEmailSentAt = new Date();
  await user.save();

  const verifyLink = `${appBaseUrl()}/verify-email?token=${rawToken}`;

  await sendMail({
    to: user.email,
    subject: 'Verify your SellAssist email address',
    html: `
      <p>Hi ${user.displayName || 'there'},</p>
      <p>Welcome to SellAssist! Click the link below to verify your email address. This link expires in 24 hours.</p>
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>If you didn't create this account, you can safely ignore this email.</p>
    `,
  });
}

/** Most identifiers kept per account for the self-referral check. */
const MAX_TRACKED_IDS = 20;

/**
 * Records today as an active day (retention stats) and any new browser id / network (salted
 * hash) for the self-referral check. Only writes when something is new, so it's usually free.
 */
function recordActivity(req: express.Request, user: any): void {
  const today = dayKey();
  const device = deviceId(req);
  const ip = ipHash(req);
  const addToSet: Record<string, string> = {};
  if (!user.activeDays?.includes(today)) addToSet['activeDays'] = today;
  if (device && !user.deviceIds?.includes(device) && (user.deviceIds?.length ?? 0) < MAX_TRACKED_IDS) addToSet['deviceIds'] = device;
  if (ip && !user.ipHashes?.includes(ip) && (user.ipHashes?.length ?? 0) < MAX_TRACKED_IDS) addToSet['ipHashes'] = ip;
  if (Object.keys(addToSet).length === 0) return;
  User.updateOne({ _id: user._id }, { $addToSet: addToSet }).catch((err: unknown) => console.error('recordActivity failed', err));
}

async function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    await ensureConnected();
    const user = await User.findById(decoded.uid).lean();
    if (!user) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    (req as any).authUser = user;
    recordActivity(req, user);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const { email, password, displayName, termsAccepted, attribution } = req.body || {};
  const phoneNumber = toIndianE164(req.body?.phoneNumber);
  // Opt-in must be an explicit boolean true — a phone number on its own is not consent.
  const whatsappOptIn = req.body?.whatsappOptIn === true;
  const gstNumber = req.body?.gstNumber ? String(req.body.gstNumber).trim().toUpperCase() : undefined;
  const state = String(req.body?.state || '').trim();
  const city = String(req.body?.city || '').trim();
  const sellsOn = Array.isArray(req.body?.sellsOn)
    ? Array.from(new Set((req.body.sellsOn as unknown[]).filter((c): c is string => typeof c === 'string' && SELLING_CHANNELS.includes(c))))
    : [];

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  if (!EMAIL_RE.test(String(email))) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  if (!phoneNumber) {
    res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.', code: 'INVALID_PHONE' });
    return;
  }

  if (gstNumber && !GSTIN_RE.test(gstNumber)) {
    res.status(400).json({ error: 'Enter a valid 15-character GSTIN, or leave it blank.' });
    return;
  }

  if (!INDIAN_STATES_AND_UTS.includes(state)) {
    res.status(400).json({ error: 'Select your state.' });
    return;
  }

  if (!city || city.length > 80) {
    res.status(400).json({ error: 'Enter your city.' });
    return;
  }

  if (termsAccepted !== true) {
    res.status(400).json({ error: 'You must agree to the Terms and Privacy Policy.' });
    return;
  }

  const catalogSizeBand = String(req.body?.catalogSizeBand || '');
  if (!coinConfig.catalogSizeBands.includes(catalogSizeBand)) {
    res.status(400).json({ error: 'Tell us how many products you sell.', code: 'CATALOG_SIZE_REQUIRED' });
    return;
  }

  const passwordError = passwordPolicyError(String(password));
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const existingPhone = await User.findOne({ phoneNumber: { $in: phoneLookupValues(phoneNumber) } });
    if (existingPhone) {
      res.status(409).json({ error: 'This number is already registered. Sign in instead?', code: 'PHONE_TAKEN' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    const cleanAttribution = sanitizeAttribution(attribution);
    // Referral link (?ref=CODE): the reward is decided later, after the new seller's first AI listing.
    let referral: Record<string, unknown> | undefined;
    const refCode = cleanAttribution?.['ref']?.toUpperCase();
    if (refCode && /^[A-Z0-9]{4,16}$/.test(refCode)) {
      const referrer = await User.findOne({ referralCode: refCode }).select('_id').lean();
      if (referrer) referral = { referrerUid: referrer._id.toString(), code: refCode, status: 'pending' };
    }
    const signupDevice = deviceId(req);
    const signupIp = ipHash(req);
    const user = new User({
      email,
      passwordHash,
      displayName,
      phoneNumber,
      gstNumber,
      state,
      city,
      sellsOn,
      termsAcceptedAt: now,
      whatsapp_opt_in: whatsappOptIn,
      whatsapp_opt_in_at: now,
      signupAt: now,
      attribution: cleanAttribution,
      catalogSizeBand,
      referral,
      signupDeviceId: signupDevice ?? undefined,
      signupIpHash: signupIp ?? undefined,
      deviceIds: signupDevice ? [signupDevice] : undefined,
      ipHashes: signupIp ? [signupIp] : undefined,
      lastLogin: now.toISOString(),
      emailVerified: false,
    });

    await user.save();

    // The account exists either way; if the email couldn't be sent, say so honestly so the page
    // can offer "Resend verification email" instead of claiming a link is on its way.
    let emailSent = true;
    try {
      await sendVerificationEmail(user);
    } catch (mailErr: any) {
      emailSent = false;
      console.error('Verification email failed to send', mailErr instanceof MailDeliveryError ? `(${mailErr.reason}) ${mailErr.message}` : mailErr);
    }

    res.json({
      requiresVerification: true,
      email: user.email,
      emailSent,
      ...(emailSent ? {} : { emailError: MAIL_UNAVAILABLE_MESSAGE }),
    });
  } catch (err: any) {
    console.error('Register error', err);
    res.status(500).json({ error: err?.message || 'Registration failed' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        error: 'Your email address has not been verified. Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
      });
      return;
    }

    user.lastLogin = new Date().toISOString();
    await user.save();
    const token = signToken(user);

    res.json({
      token,
      user: {
        uid: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        gstNumber: user.gstNumber,
        role: user.role,
        usageCount: user.usageCount,
        lastLogin: user.lastLogin,
        dailyStats: user.dailyStats,
      },
    });
  } catch (err: any) {
    console.error('Login error', err);
    res.status(500).json({ error: err?.message || 'Login failed' });
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const { token } = req.body || {};
  if (!token) {
    res.status(400).json({ error: 'Verification token required' });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ error: 'Your verification link has expired. Request a new verification email.' });
      return;
    }

    user.emailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    user.lastLogin = new Date().toISOString();
    await user.save();

    // Welcome bonus (and the mobile-number bonus) land as soon as the email is verified.
    await ensureWallet(user._id.toString()).catch((err) => console.error('[wallet] welcome bonus failed', err));

    // Sign the user in immediately — they just proved ownership of the email, no need to make
    // them type their password again right after clicking the link.
    const authToken = signToken(user);

    res.json({
      token: authToken,
      user: {
        uid: user._id.toString(),
        email: user.email,
        displayName: user.displayName,
        phoneNumber: user.phoneNumber,
        gstNumber: user.gstNumber,
        role: user.role,
        usageCount: user.usageCount,
        lastLogin: user.lastLogin,
        dailyStats: user.dailyStats,
      },
    });
  } catch (err: any) {
    console.error('Verify email error', err);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }

  // Generic response either way — same reasoning as /forgot-password: don't reveal whether an
  // email is registered.
  const genericResponse = { message: 'If that account needs verification, a new link has been sent.' };

  try {
    const user = await User.findOne({ email });
    if (user && !user.emailVerified) {
      const lastSent = user.verificationEmailSentAt ? new Date(user.verificationEmailSentAt).getTime() : 0;
      const waitMs = lastSent + VERIFICATION_RESEND_COOLDOWN_MS - Date.now();
      if (waitMs > 0) {
        const retryAfter = Math.ceil(waitMs / 1000);
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({ error: `Please wait ${retryAfter} seconds before requesting another email.`, retryAfter });
        return;
      }
      await sendVerificationEmail(user);
    }
    res.json(genericResponse);
  } catch (err: any) {
    if (err instanceof MailDeliveryError) {
      console.error(`Resend verification: email not sent (${err.reason})`, err.message);
      res.status(503).json({ error: MAIL_UNAVAILABLE_MESSAGE, code: 'EMAIL_SEND_FAILED' });
      return;
    }
    console.error('Resend verification error', err);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const { email } = req.body || {};

  if (!email) {
    res.status(400).json({ error: 'Email required' });
    return;
  }

  // Always respond with a generic message to avoid leaking which emails are registered.
  const genericResponse = { message: 'If an account exists for that email, a reset link has been sent.' };

  try {
    const user = await User.findOne({ email });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      user.resetPasswordTokenHash = tokenHash;
      user.resetPasswordExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await user.save();

      const resetLink = `${appBaseUrl()}/reset-password?token=${rawToken}`;

      await sendMail({
        to: user.email,
        subject: 'Reset your SellAssist password',
        html: `
          <p>Hi ${user.displayName || 'there'},</p>
          <p>We received a request to reset your SellAssist password. Click the link below to choose a new password. This link expires in 30 minutes.</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>If you didn't request this, you can safely ignore this email.</p>
        `,
      });
    }

    res.json(genericResponse);
  } catch (err: any) {
    if (err instanceof MailDeliveryError) {
      console.error(`Forgot password: email not sent (${err.reason})`, err.message);
      res.status(503).json({ error: MAIL_UNAVAILABLE_MESSAGE, code: 'EMAIL_SEND_FAILED' });
      return;
    }
    console.error('Forgot password error', err);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const { token, password } = req.body || {};

  if (!token || !password) {
    res.status(400).json({ error: 'Token and new password required' });
    return;
  }

  const passwordError = passwordPolicyError(String(password));
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ error: 'Your password reset link has expired or is invalid. Please request a new one.' });
      return;
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ ok: true });
  } catch (err: any) {
    console.error('Reset password error', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  const user = (req as any).authUser;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  await setCoinBalanceHeader(res, user._id.toString());
  res.json({
    user: {
      uid: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber,
      gstNumber: user.gstNumber,
      role: user.role,
      usageCount: user.usageCount,
      lastLogin: user.lastLogin,
      dailyStats: user.dailyStats,
      state: user.state,
      city: user.city,
      whatsapp_opt_in: user.whatsapp_opt_in ?? false,
      catalogSizeBand: user.catalogSizeBand ?? null,
      catalogPromptDismissed: !!user.catalogPromptDismissedAt,
      coins: { free: user.coins?.free ?? 0, paid: user.coins?.paid ?? 0 },
    },
  });
});

// Settings → Profile: change password (requires the current one).
router.post('/change-password', authMiddleware, accountChangeLimiter, async (req, res) => {
  const authUser = (req as any).authUser;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Enter your current password and a new password.' });
    return;
  }
  const policyError = passwordPolicyError(String(newPassword));
  if (policyError) {
    res.status(400).json({ error: policyError });
    return;
  }
  try {
    const user = await User.findById(authUser._id);
    if (!user || !(await bcrypt.compare(String(currentPassword), user.passwordHash))) {
      res.status(401).json({ error: 'Your current password is incorrect.' });
      return;
    }
    user.passwordHash = await bcrypt.hash(String(newPassword), 10);
    await user.save();
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Change password error', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Settings → Profile: permanently delete the account and everything stored for it, including
// marketplace connection tokens. Requires the password as confirmation.
router.delete('/me', authMiddleware, accountChangeLimiter, async (req, res) => {
  const authUser = (req as any).authUser;
  const { password } = req.body || {};
  if (!password) {
    res.status(400).json({ error: 'Enter your password to delete your account.' });
    return;
  }
  try {
    const user = await User.findById(authUser._id);
    if (!user || !(await bcrypt.compare(String(password), user.passwordHash))) {
      res.status(401).json({ error: 'Your password is incorrect.' });
      return;
    }
    const uid = user._id.toString();
    // A referral reward paid for this account in the last few days is taken back from the referrer.
    await reverseReferralOnDelete(user.toObject()).catch((err) => console.error('[referral] reversal failed', err));
    // AI usage rows and coin-pack payment records are kept (by user id only) for accounting.
    await Promise.all([
      CoinLedger.deleteMany({ uid }),
      AssistCounter.deleteMany({ uid }),
      PackInterest.deleteMany({ uid }),
      GstLookup.deleteMany({ uid }),
      Listing.deleteMany({ uid }),
      Sale.deleteMany({ uid }),
      ListingDraft.deleteMany({ uid }),
      Feedback.deleteMany({ uid }),
      TemplateConfig.deleteMany({ uid }),
      MarketplaceConnection.deleteMany({ uid }),
      AmazonAuthState.deleteMany({ uid }),
    ]);
    await user.deleteOne();
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Delete account error', err);
    res.status(500).json({ error: 'Failed to delete your account. Please contact support.' });
  }
});

router.patch('/users/:id', authMiddleware, async (req, res) => {
  try {
    await ensureConnected();
  } catch (error: any) {
    res.status(503).json({ error: error?.message || 'Database is not configured.' });
    return;
  }

  const authUser = (req as any).authUser;
  const { id } = req.params;
  const updates = req.body || {};

  if (!authUser) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (authUser._id.toString() !== id && authUser.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (updates.incrementUsage) {
      user.usageCount = (user.usageCount || 0) + 1;
      const today = new Date().toISOString().split('T')[0];
      if (user.dailyStats?.date === today) {
        user.dailyStats.count = (user.dailyStats.count || 0) + 1;
      } else {
        user.dailyStats = { date: today, count: 1 };
      }
    }

    // Phone numbers are validated and stored as E.164 (+91XXXXXXXXXX), same as registration.
    if (updates.phoneNumber !== undefined) {
      if (updates.phoneNumber === '' || updates.phoneNumber === null) {
        delete updates.phoneNumber;
        user.phoneNumber = undefined;
      } else {
        const normalized = toIndianE164(updates.phoneNumber);
        if (!normalized) {
          res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.', code: 'INVALID_PHONE' });
          return;
        }
        updates.phoneNumber = normalized;
        const existingPhone = await User.findOne({ phoneNumber: { $in: phoneLookupValues(normalized) }, _id: { $ne: user._id } });
        if (existingPhone) {
          res.status(409).json({ error: 'This number is already registered. Sign in instead?', code: 'PHONE_TAKEN' });
          return;
        }
      }
    }

    if (typeof updates.whatsapp_opt_in === 'boolean') {
      user.whatsapp_opt_in = updates.whatsapp_opt_in;
      user.whatsapp_opt_in_at = new Date();
    }

    // Only admins may change roles — otherwise any user could promote themselves.
    const allowed = authUser.role === 'ADMIN'
      ? ['displayName', 'phoneNumber', 'gstNumber', 'role']
      : ['displayName', 'phoneNumber', 'gstNumber'];
    for (const field of allowed) {
      if (updates[field] !== undefined) {
        (user as any)[field] = updates[field];
      }
    }

    await user.save();

    // +2 coins the first time a mobile number is saved on the profile (once per account).
    const selfId = authUser._id.toString();
    if (user.phoneNumber && selfId === String(id)) {
      await ensureWallet(selfId).then(() => grantBonus(selfId, 'mobile')).catch((err) => console.error('[wallet] mobile bonus failed', err));
      await setCoinBalanceHeader(res, selfId);
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error('User update error', err);
    res.status(500).json({ error: err?.message || 'Failed to update user' });
  }
});

export { authMiddleware };
export default router;
