import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { ensureConnected, User } from './common.js';
import { sendMail } from '../utils/mailer.js';

const router = express.Router();
const JWT_SECRET = process.env['JWT_SECRET'] || 'dev_jwt_secret_change_me';

// Keyed on IP + email together (not IP alone) so one abusive IP can't lock out every account
// behind a shared NAT/office network, and one targeted account can't be brute-forced from many IPs.
function loginRateKey(req: express.Request): string {
  const email = String(req.body?.email || '').toLowerCase().trim();
  return `${req.ip}:${email}`;
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

function passwordPolicyError(password: string): string | null {
  if (!STRONG_PASSWORD_RE.test(password)) {
    return 'Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
  }
  return null;
}

function signToken(user: any) {
  return jwt.sign({ uid: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: '7d' });
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

  const { email, password, displayName, phoneNumber, gstNumber } = req.body || {};

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  if (!EMAIL_RE.test(String(email))) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  if (phoneNumber && !/^\d{10}$/.test(String(phoneNumber))) {
    res.status(400).json({ error: 'Mobile number must be exactly 10 digits.' });
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

    if (phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone) {
        res.status(409).json({ error: 'Phone number already registered' });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      email,
      passwordHash,
      displayName,
      phoneNumber,
      gstNumber,
      lastLogin: new Date().toISOString(),
    });

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

      const frontendUrl = process.env['FRONTEND_URL'] || 'http://localhost:4200';
      const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

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
    },
  });
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

    if (updates.phoneNumber && updates.phoneNumber !== user.phoneNumber) {
      const existingPhone = await User.findOne({ phoneNumber: updates.phoneNumber });
      if (existingPhone) {
        res.status(409).json({ error: 'Phone number already registered' });
        return;
      }
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
    res.json({ ok: true });
  } catch (err: any) {
    console.error('User update error', err);
    res.status(500).json({ error: err?.message || 'Failed to update user' });
  }
});

export { authMiddleware };
export default router;
