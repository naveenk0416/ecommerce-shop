import './utils/env.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRouter from './api/auth.js';
import adminRouter from './api/admin.js';
import listingRouter from './api/listing.js';
import templateRouter from './api/template.js';
import feedbackRouter from './api/feedback.js';
import razorpayRouter from './api/razorpay.js';
import razorpayConfigRouter from './api/razorpay-config.js';
import barcodeRouter from './api/barcode.js';
import marketplaceConnectionsRouter, { amazonOAuthRouter, flipkartOAuthRouter } from './api/marketplace-connections.js';

// Origins allowed to call this API in addition to localhost dev servers. Configure the deployed
// frontend's origin (e.g. https://your-site.hostinger.com) via FRONTEND_URL in the backend .env.
const allowedOrigins = (process.env['FRONTEND_URL'] || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) {
      callback(null, true);
    } else if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin not allowed — ${origin}`));
    }
  },
  credentials: true,
}));

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log('[REQ]', req.method, req.url);
  next();
});

// Prevents the full request URL (which can carry OAuth state/codes as query params) from
// leaking to a third-party site via the Referer header when a page links out.
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.get('/debug', (req: Request, res: Response) => {
  res.json({ url: req.url, headers: req.headers });
});

app.get('/test', (req: Request, res: Response) => {
  res.json({ message: 'API is working' });
});

app.use('/api', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/listings', listingRouter);
app.use('/api/templates', templateRouter);
app.use('/api/feedback', feedbackRouter);
app.use('/api', razorpayConfigRouter);
app.use('/api', razorpayRouter);
app.use('/api/barcode', barcodeRouter);
app.use('/api/marketplace-connections', marketplaceConnectionsRouter);
// Mounted at the true root, not under /api — these two paths must exactly match the "Login URI"
// and "Redirect URI" registered for the app in Amazon's Solution Provider Portal.
app.use(amazonOAuthRouter);
// Same reasoning — must match the callback URL registered in Flipkart's Seller APIs Developer
// Admin portal exactly.
app.use(flipkartOAuthRouter);

app.get('/', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'SellAssist API' });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.url}` });
});

const port = process.env['SERVER_PORT'] || process.env['PORT'] || 4000;
// Bind to 0.0.0.0, not 'localhost' — in a container/cloud deployment the platform's routing
// layer connects from outside this process's network namespace, so a loopback-only bind
// (127.0.0.1) accepts local connections but is unreachable from the outside, even though the
// process starts and logs successfully.
app.listen(Number(port), '0.0.0.0', () => {
  console.log(`[SERVER] Node Express server listening on 0.0.0.0:${port}`);
});
