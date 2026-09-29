import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { AbuseEvent, AmazonAuthState, AssistCounter, CoinLedger, ensureConnected, FeatureInterest, Feedback, GstLookup, Listing, ListingDraft, MarketplaceConnection, PackInterest, Sale, TemplateConfig, User } from './common.js';
import { MAIL_UNAVAILABLE_MESSAGE, MailDeliveryError, sendMail } from '../utils/mailer.js';
import { GSTIN_RE, INDIAN_STATES_AND_UTS, SELLING_CHANNELS, phoneLookupValues, sanitizeAttribution, toIndianE164 } from '../utils/signup-fields.js';
import { coinConfig, dayKey } from '../config/coins.js';
import { deviceId, ipHash } from '../utils/request-identity.js';
import { ensureWallet, grantBonus, processReferralAfterListing, reverseReferralOnDelete, welcomeEligibility } from '../utils/wallet.js';
import { setCoinBalanceHeader } from '../utils/coin-header.js';
import { checkSignupEmail, emailDomain } from '../utils/email-check.js';
import { recordUserFunnelEvent } from '../utils/funnel.js';

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
  // REGISTER_RATE_LIMIT only exists for the test suites, which create many accounts from one IP.
  limit: Number(process.env['REGISTER_RATE_LIMIT']) || 10,
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
async function sendVerificationEmail(user: any, variant: 'signup' | 'reminder' = 'signup'): Promise<void> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  user.verificationEmailSentAt = new Date();
  await user.save();

  const verifyLink = `${appBaseUrl()}/verify-email?token=${rawToken}`;

  const rest = coinConfig.welcomeBonus - Math.min(coinConfig.welcomeImmediate, coinConfig.welcomeBonus);
  const coinsLine = user.welcomeSplit && user.welcomeEligible && rest > 0
    ? `<p>Verify now to get <strong>${rest} more free AI listings</strong>.</p>` : '';
  await sendMail({
    to: user.email,
    subject: variant === 'reminder' ? 'Reminder: verify your SellAssist email' : 'Verify your SellAssist email address',
    html: `
      <p>Hi ${user.displayName || 'there'},</p>
      <p>${variant === 'reminder' ? 'You haven\'t verified your SellAssist email yet.' : 'Welcome to SellAssist!'} Click the link below to verify your email address. This link expires in 24 hours.</p>
      ${coinsLine}
      <p><a href="${verifyLink}">${verifyLink}</a></p>
      <p>If you didn't create this account, you can safely ignore this email.</p>
    `,
  });
}

/**
 * One reminder email, 24h after sign-up, to accounts that still haven't verified (only recent
 * ones, so old accounts are never mailed). Run every 30 minutes by the server (server.ts).
 */
export async function sendVerificationReminders(now = new Date()): Promise<number> {
  const { verificationReminderAfterHours, verificationReminderMaxAgeDays } = coinConfig.signup;
  const users = await User.find({
    emailVerified: false,
    verificationReminderSentAt: { $exists: false },
    createdAt: {
      $lte: new Date(now.getTime() - verificationReminderAfterHours * 3600 * 1000),
      $gte: new Date(now.getTime() - verificationReminderMaxAgeDays * 24 * 3600 * 1000),
    },
  }).limit(50);
  let sent = 0;
  for (const user of users) {
    try {
      await sendVerificationEmail(user, 'reminder');
      await User.updateOne({ _id: user._id }, { $set: { verificationReminderSentAt: new Date() } });
      sent += 1;
    } catch (err: any) {
      console.error('[verify-reminder] not sent', err instanceof MailDeliveryError ? err.reason : err?.message);
    }
  }
  if (sent) console.log(`[verify-reminder] sent ${sent} reminder email(s)`);
  return sent;
}

/** The signed-in user as returned by /login, /register, /verify-email and Google sign-in. */
function publicUser(user: any) {
  return {
    uid: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    phoneNumber: user.phoneNumber,
    gstNumber: user.gstNumber,
    role: user.role,
    usageCount: user.usageCount,
    lastLogin: user.lastLogin,
    dailyStats: user.dailyStats,
    emailVerified: !!user.emailVerified,
  };
}

const PHONE_TAKEN_MESSAGE = 'This number is already registered. Login instead?';

function logAbuse(req: express.Request, type: string, extra: Record<string, unknown> = {}): void {
  AbuseEvent.create({ type, deviceId: deviceId(req) ?? undefined, ipHash: ipHash(req) ?? undefined, ...extra })
    .catch((err: unknown) => console.error('[abuse] not logged', err));
}

/**
 * Creates a seller account (email sign-up or Google), decides whether it may receive welcome
 * coins (first account on this device, ≤ N sign-ups per network per day), gives the part of the
 * welcome bonus it's entitled to right away, and records the sign_up funnel step.
 */
async function createAccount(req: express.Request, data: {
  email: string; passwordHash: string; displayName?: string; phoneNumber: string; whatsappOptIn: boolean;
  attribution: unknown; emailVerified: boolean; signupMethod: 'email' | 'google'; googleSub?: string;
  extra?: Record<string, unknown>;
}) {
  const now = new Date();
  const cleanAttribution = sanitizeAttribution(data.attribution);
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
    email: data.email,
    passwordHash: data.passwordHash,
    displayName: data.displayName,
    phoneNumber: data.phoneNumber,
    termsAcceptedAt: now,
    whatsapp_opt_in: data.whatsappOptIn,
    whatsapp_opt_in_at: now,
    signupAt: now,
    signupMethod: data.signupMethod,
    googleSub: data.googleSub,
    attribution: cleanAttribution,
    referral,
    signupDeviceId: signupDevice ?? undefined,
    signupIpHash: signupIp ?? undefined,
    deviceIds: signupDevice ? [signupDevice] : undefined,
    ipHashes: signupIp ? [signupIp] : undefined,
    lastLogin: now.toISOString(),
    emailVerified: data.emailVerified,
    welcomeSplit: true,
    ...data.extra,
  });
  await user.save();

  const eligibility = await welcomeEligibility(user);
  user.welcomeEligible = eligibility.eligible;
  if (!eligibility.eligible) {
    user.welcomeBlockedReason = eligibility.reason;
    logAbuse(req, eligibility.reason === 'device' ? 'welcome_blocked_device' : 'welcome_blocked_ip', { uid: user._id.toString(), emailDomain: emailDomain(data.email) });
  }
  await user.save();
  await ensureWallet(user._id.toString()).catch((err) => console.error('[wallet] welcome bonus failed', err));
  await recordUserFunnelEvent('sign_up', user);
  if (data.emailVerified) await recordUserFunnelEvent('email_verified', user);
  return user;
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

  const { password, termsAccepted, attribution } = req.body || {};
  const email = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || '').trim().slice(0, 80);
  const phoneNumber = toIndianE164(req.body?.phoneNumber);
  // Opt-in must be an explicit boolean true — a phone number on its own is not consent.
  const whatsappOptIn = req.body?.whatsappOptIn === true;
  const gstNumber = req.body?.gstNumber ? String(req.body.gstNumber).trim().toUpperCase() : undefined;
  // State, city, product count, channels and GST moved to the optional "Tell us about your
  // business" card after sign-up; still accepted here (and validated) if a client sends them.
  const state = String(req.body?.state || '').trim();
  const city = String(req.body?.city || '').trim();
  const sellsOn = Array.isArray(req.body?.sellsOn)
    ? Array.from(new Set((req.body.sellsOn as unknown[]).filter((c): c is string => typeof c === 'string' && SELLING_CHANNELS.includes(c))))
    : [];

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  if (displayName.length < 2) {
    res.status(400).json({ error: 'Enter your full name.', code: 'NAME_REQUIRED' });
    return;
  }

  const emailCheck = await checkSignupEmail(email);
  if (!emailCheck.ok) {
    if (emailCheck.code === 'DISPOSABLE_EMAIL') logAbuse(req, 'disposable_email', { emailDomain: emailDomain(email) });
    res.status(400).json({ error: emailCheck.error, code: emailCheck.code, ...(emailCheck.suggestion ? { suggestion: emailCheck.suggestion } : {}) });
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

  if (state && !INDIAN_STATES_AND_UTS.includes(state)) {
    res.status(400).json({ error: 'Select your state.' });
    return;
  }

  if (city.length > 80) {
    res.status(400).json({ error: 'Enter your city.' });
    return;
  }

  if (termsAccepted !== true) {
    res.status(400).json({ error: 'You must agree to the Terms and Privacy Policy.' });
    return;
  }

  const catalogSizeBand = String(req.body?.catalogSizeBand || '');
  if (catalogSizeBand && !coinConfig.catalogSizeBands.includes(catalogSizeBand)) {
    res.status(400).json({ error: 'Tell us how many products you sell.', code: 'CATALOG_SIZE_REQUIRED' });
    return;
  }

  const passwordError = passwordPolicyError(String(password));
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const existing = await User.findOne({ email: { $in: [email, String(req.body?.email || '').trim()] } });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const existingPhone = await User.findOne({ phoneNumber: { $in: phoneLookupValues(phoneNumber) } });
    if (existingPhone) {
      res.status(409).json({ error: PHONE_TAKEN_MESSAGE, code: 'PHONE_TAKEN' });
      return;
    }

    const user = await createAccount(req, {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      displayName,
      phoneNumber,
      whatsappOptIn,
      attribution,
      emailVerified: false,
      signupMethod: 'email',
      extra: {
        gstNumber,
        state: state || undefined,
        city: city || undefined,
        sellsOn: sellsOn.length ? sellsOn : undefined,
        catalogSizeBand: catalogSizeBand || undefined,
      },
    });

    // The account exists either way; if the email couldn't be sent, say so honestly so the page
    // can offer "Resend verification email" instead of claiming a link is on its way.
    let emailSent = true;
    try {
      await sendVerificationEmail(user);
    } catch (mailErr: any) {
      emailSent = false;
      console.error('Verification email failed to send', mailErr instanceof MailDeliveryError ? `(${mailErr.reason}) ${mailErr.message}` : mailErr);
    }

    // Signed in straight away: the email is verified later (it unlocks the rest of the welcome
    // coins), so the first listing can be made right now.
    res.json({
      token: signToken(user),
      user: publicUser(user),
      requiresVerification: false,
      email: user.email,
      emailSent,
      ...(emailSent ? {} : { emailError: MAIL_UNAVAILABLE_MESSAGE }),
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(409).json(/phone/i.test(String(err?.message)) ? { error: PHONE_TAKEN_MESSAGE, code: 'PHONE_TAKEN' } : { error: 'Email already registered' });
      return;
    }
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
    const typed = String(email).trim();
    const user = await User.findOne({ email: typed }) ?? await User.findOne({ email: typed.toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Unverified accounts can sign in too — verification only unlocks the rest of the welcome
    // coins, bonuses, referrals and coin packs (a banner in the app asks for it).
    user.lastLogin = new Date().toISOString();
    await user.save();
    const token = signToken(user);

    res.json({ token, user: publicUser(user) });
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

    // The rest of the welcome bonus, the mobile-number bonus and any bonus earned while
    // unverified land as soon as the email is verified; so does a pending referral reward.
    const uid = user._id.toString();
    await ensureWallet(uid).catch((err) => console.error('[wallet] welcome bonus failed', err));
    if (user.firstListingAt || (user.usageCount ?? 0) > 0) {
      await processReferralAfterListing(uid).catch((err) => console.error('[referral] reward failed', err));
    }
    await recordUserFunnelEvent('email_verified', user);

    // Sign the user in immediately — they just proved ownership of the email, no need to make
    // them type their password again right after clicking the link.
    const authToken = signToken(user);
    await setCoinBalanceHeader(res, uid);
    res.json({ token: authToken, user: publicUser(user) });
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
      emailVerified: !!user.emailVerified,
      /** When the last verification email went out — the Resend button waits 60s after it. */
      verificationEmailSentAt: user.verificationEmailSentAt ?? null,
      signupMethod: user.signupMethod ?? null,
      sellsOn: user.sellsOn ?? [],
      /** "Tell us about your business" card: hidden once filled in or dismissed. */
      businessCard: {
        show: !user.businessCardDismissedAt && !(user.state && user.catalogSizeBand && user.sellsOn?.length),
        done: !!(user.state && user.catalogSizeBand && user.sellsOn?.length),
        bonus: coinConfig.earnedBonuses.businessDetails,
      },
    },
  });
});

const checkEmailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

/** Sign-up form's email check on blur: typo suggestion, disposable domain, no MX records. */
router.post('/check-email', checkEmailLimiter, async (req, res) => {
  const result = await checkSignupEmail(req.body?.email);
  res.json(result);
});

/**
 * Onboarding card "Tell us about your business (+2 coins)": state, city, product count, where
 * you sell, GST number — all optional. +2 once state + product count + channels are filled
 * (waits for email verification like every bonus). { dismiss: true } just hides the card.
 */
router.patch('/me/business', authMiddleware, async (req, res) => {
  const authUser = (req as any).authUser;
  const uid = authUser._id.toString();
  const body = req.body || {};
  if (body.dismiss === true) {
    await User.updateOne({ _id: uid }, { $set: { businessCardDismissedAt: new Date() } });
    res.json({ ok: true });
    return;
  }
  const set: Record<string, unknown> = {};
  if (body.state !== undefined) {
    const state = String(body.state || '').trim();
    if (state && !INDIAN_STATES_AND_UTS.includes(state)) {
      res.status(400).json({ error: 'Select your state.', field: 'state' });
      return;
    }
    set['state'] = state || undefined;
  }
  if (body.city !== undefined) {
    const city = String(body.city || '').trim();
    if (city.length > 80) {
      res.status(400).json({ error: 'Enter your city.', field: 'city' });
      return;
    }
    set['city'] = city || undefined;
  }
  if (body.catalogSizeBand !== undefined) {
    const band = String(body.catalogSizeBand || '');
    if (band && !coinConfig.catalogSizeBands.includes(band)) {
      res.status(400).json({ error: 'Tell us how many products you sell.', field: 'catalogSizeBand' });
      return;
    }
    set['catalogSizeBand'] = band || undefined;
  }
  if (body.sellsOn !== undefined) {
    set['sellsOn'] = Array.isArray(body.sellsOn)
      ? Array.from(new Set((body.sellsOn as unknown[]).filter((c): c is string => typeof c === 'string' && SELLING_CHANNELS.includes(c))))
      : [];
  }
  if (body.gstNumber !== undefined) {
    const gst = String(body.gstNumber || '').trim().toUpperCase();
    if (gst && !GSTIN_RE.test(gst)) {
      res.status(400).json({ error: 'Enter a valid 15-character GSTIN, or leave it blank.', field: 'gstNumber' });
      return;
    }
    set['gstNumber'] = gst || undefined;
  }
  const user = await User.findByIdAndUpdate(uid, { $set: set }, { new: true });
  let bonusGranted = false;
  let bonusPending = false;
  if (user && user.state && user.catalogSizeBand && user.sellsOn?.length) {
    const first = await User.updateOne({ _id: uid, businessDetailsAt: { $exists: false } }, { $set: { businessDetailsAt: new Date() } });
    if (first.modifiedCount === 1) await recordUserFunnelEvent('onboarding_details_added', user);
    bonusGranted = await ensureWallet(uid).then(() => grantBonus(uid, 'businessDetails')).catch((err) => {
      console.error('[wallet] business details bonus failed', err);
      return false;
    });
    bonusPending = !user.emailVerified;
  }
  await setCoinBalanceHeader(res, uid);
  res.json({ ok: true, bonusGranted, bonusPending, complete: !!(user?.state && user?.catalogSizeBand && user?.sellsOn?.length) });
});

// ---- Continue with Google (Google Identity Services ID token, verified here) ----

interface GoogleProfile { sub: string; email: string; emailVerified: boolean; name?: string }
type GoogleVerifier = (credential: string) => Promise<GoogleProfile | null>;

const realGoogleVerifier: GoogleVerifier = async (credential) => {
  const clientId = process.env['GOOGLE_CLIENT_ID'];
  if (!clientId) return null;
  const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) return null;
  return { sub: payload.sub, email: payload.email.toLowerCase(), emailVerified: payload.email_verified === true, name: payload.name };
};
let googleVerifier: GoogleVerifier = realGoogleVerifier;
let googleConfiguredForTests = false;

/** Tests replace Google's token check. */
export function setGoogleVerifierForTests(fn: GoogleVerifier | null): void {
  googleVerifier = fn ?? realGoogleVerifier;
  googleConfiguredForTests = !!fn;
}

const googleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip || ''),
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' },
});

/**
 * Step 1: the Google credential. An existing account (same Google id or email) is signed in —
 * and marked verified, since Google verified the email. A new one gets a 30-minute pending token
 * and the app asks only for the mobile number + terms (step 2).
 */
router.post('/auth/google', googleLimiter, async (req, res) => {
  if (!process.env['GOOGLE_CLIENT_ID'] && !googleConfiguredForTests) {
    res.status(503).json({ error: 'Google sign-in is not set up yet.', code: 'GOOGLE_NOT_CONFIGURED' });
    return;
  }
  let profile: GoogleProfile | null = null;
  try {
    profile = typeof req.body?.credential === 'string' ? await googleVerifier(req.body.credential) : null;
  } catch (err: any) {
    console.error('[google] token rejected', err?.message);
  }
  if (!profile || !profile.emailVerified) {
    res.status(401).json({ error: 'Google sign-in failed. Please try again.', code: 'GOOGLE_INVALID' });
    return;
  }
  await ensureConnected();
  const user = await User.findOne({ googleSub: profile.sub }) ?? await User.findOne({ email: profile.email });
  if (user) {
    if (!user.googleSub) user.googleSub = profile.sub;
    const newlyVerified = !user.emailVerified;
    if (newlyVerified) {
      user.emailVerified = true;
      user.emailVerificationTokenHash = undefined;
      user.emailVerificationExpires = undefined;
    }
    user.lastLogin = new Date().toISOString();
    await user.save();
    if (newlyVerified) {
      await ensureWallet(user._id.toString()).catch((err) => console.error('[wallet] welcome bonus failed', err));
      await recordUserFunnelEvent('email_verified', user);
    }
    res.json({ token: signToken(user), user: publicUser(user) });
    return;
  }
  const pendingToken = jwt.sign({ kind: 'google_signup', sub: profile.sub, email: profile.email, name: profile.name ?? '' }, JWT_SECRET, { expiresIn: '30m' });
  res.json({ needsProfile: true, pendingToken, email: profile.email, name: profile.name ?? '' });
});

/** Step 2 for a new Google account: mobile number + terms. The email is already verified, so the
 * whole welcome bonus arrives at once (if the device/network limits allow it). */
router.post('/auth/google/complete', googleLimiter, async (req, res) => {
  let pending: { kind?: string; sub?: string; email?: string; name?: string };
  try {
    pending = jwt.verify(String(req.body?.pendingToken || ''), JWT_SECRET) as typeof pending;
  } catch {
    res.status(401).json({ error: 'Your Google sign-in expired. Please try again.', code: 'GOOGLE_EXPIRED' });
    return;
  }
  if (pending.kind !== 'google_signup' || !pending.sub || !pending.email) {
    res.status(401).json({ error: 'Your Google sign-in expired. Please try again.', code: 'GOOGLE_EXPIRED' });
    return;
  }
  const phoneNumber = toIndianE164(req.body?.phoneNumber);
  if (!phoneNumber) {
    res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.', code: 'INVALID_PHONE' });
    return;
  }
  if (req.body?.termsAccepted !== true) {
    res.status(400).json({ error: 'You must agree to the Terms and Privacy Policy.' });
    return;
  }
  await ensureConnected();
  try {
    if (await User.exists({ $or: [{ email: pending.email }, { googleSub: pending.sub }] })) {
      res.status(409).json({ error: 'This Google account is already registered. Please sign in with Google again.' });
      return;
    }
    if (await User.exists({ phoneNumber: { $in: phoneLookupValues(phoneNumber) } })) {
      res.status(409).json({ error: PHONE_TAKEN_MESSAGE, code: 'PHONE_TAKEN' });
      return;
    }
    const user = await createAccount(req, {
      email: pending.email,
      // No password: Google accounts sign in with Google (or set one via "Forgot password").
      passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
      displayName: String(req.body?.displayName || pending.name || '').trim().slice(0, 80) || undefined,
      phoneNumber,
      whatsappOptIn: req.body?.whatsappOptIn === true,
      attribution: req.body?.attribution,
      emailVerified: true,
      signupMethod: 'google',
      googleSub: pending.sub,
    });
    await setCoinBalanceHeader(res, user._id.toString());
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err: any) {
    if (err?.code === 11000) {
      res.status(409).json(/phone/i.test(String(err?.message)) ? { error: PHONE_TAKEN_MESSAGE, code: 'PHONE_TAKEN' } : { error: 'This Google account is already registered.' });
      return;
    }
    console.error('Google sign-up error', err);
    res.status(500).json({ error: 'Sign-up failed. Please try again.' });
  }
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
      FeatureInterest.deleteMany({ uid }),
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
          res.status(409).json({ error: PHONE_TAKEN_MESSAGE, code: 'PHONE_TAKEN' });
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
