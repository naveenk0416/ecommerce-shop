import '@angular/compiler';
import './utils/env.js';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  createWebRequestFromNodeRequest,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { ɵsetAngularAppEngineManifest as setAngularAppEngineManifest, ɵsetAngularAppManifest as setAngularAppManifest } from '@angular/ssr';
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
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const browserDistFolder = join(__dirname, '..', '..', 'dist', 'app', 'browser');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(origin)) {
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

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.url.startsWith('/api/')) {
    console.log(`[API Request] ${req.method} ${req.url}`);
  }
  next();
});

let angularApp: AngularNodeAppEngine | undefined;

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

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.url.startsWith('/api/')) {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
    return;
  }
  next();
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (!angularApp) {
    return next();
  }

  try {
    console.log('[SSR] invoking angularApp.handle for', req.method, req.url);
    const webRequest = createWebRequestFromNodeRequest(req as any);
    const response = await angularApp.handle(webRequest);
    if (!response) {
      console.log('[SSR] angularApp.handle returned null, falling back to next()');
      return next();
    }
    await writeResponseToNodeResponse(response, res as any);
    return;
  } catch (err) {
    const errorName = err instanceof Error ? err.name : 'UnknownError';
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[SSR] Angular rendering error:', errorName, errorMessage);
    try {
      console.error('[SSR] Angular error properties:', Object.getOwnPropertyNames(err), JSON.stringify(err, Object.getOwnPropertyNames(err)));
    } catch (loggingError) {
      console.error('[SSR] Could not stringify error object:', loggingError);
    }
    return next(err);
  }
});

// Reached only when nothing above handled the request — i.e. no frontend build is present
// (API-only deployment) and the path isn't a known API route. Keeps responses JSON-consistent
// instead of falling through to Express's default HTML 404 page.
app.use((req: Request, res: Response) => {
  if (req.url === '/' || req.url === '') {
    res.json({ status: 'ok', service: 'SellAssist API', message: 'Backend is running in API-only mode.' });
    return;
  }
  res.status(404).json({ error: `Not found: ${req.method} ${req.url}` });
});

// ✅ All setup and app.listen() inside the async IIFE so the event loop
//    stays alive and tsx doesn't exit prematurely
(async () => {
  const serverDist = join(__dirname, '..', '..', 'dist', 'app', 'server');
  const engineManifestPath = join(serverDist, 'angular-app-engine-manifest.mjs');
  const appManifestPath = join(serverDist, 'angular-app-manifest.mjs');

  if (!existsSync(engineManifestPath) || !existsSync(appManifestPath)) {
    // No frontend build alongside this deployment (e.g. a backend-only deploy) — run as an
    // API-only server instead of repeatedly trying and failing to load SSR manifests.
    console.log('[SSR] No frontend build found at', serverDist, '— running as an API-only backend.');
  } else {
    try {
      const { pathToFileURL } = await import('node:url');

      try {
        console.log('[SSR] Attempting to load engine manifest from', engineManifestPath);
        const engineMod = await import(pathToFileURL(engineManifestPath).href);
        try {
          if (engineMod?.default && Array.isArray(engineMod.default.allowedHosts) && engineMod.default.allowedHosts.length === 0) {
            engineMod.default.allowedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
          }
        } catch (ex) {
          // ignore
        }
        setAngularAppEngineManifest(engineMod.default);
        console.log('[SSR] Loaded Angular app engine manifest from', engineManifestPath);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn('[SSR] Engine manifest load failed:', errorMessage);
      }

      try {
        console.log('[SSR] Attempting to load app manifest from', appManifestPath);
        const appMod = await import(pathToFileURL(appManifestPath).href);
        setAngularAppManifest(appMod.default);
        console.log('[SSR] Loaded Angular app manifest from', appManifestPath);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn('[SSR] App manifest load failed:', errorMessage);
      }

      angularApp = new AngularNodeAppEngine({
        allowedHosts: ['localhost', '127.0.0.1', '0.0.0.0'],
      });
    } catch (err) {
      console.warn('AngularNodeAppEngine could not be initialized. Prerendering/SSR might be unavailable.', err);
      angularApp = undefined;
    }
  }

  // Start server after all async setup is complete
  const port = process.env['SERVER_PORT'] || process.env['PORT'] || 4000;
  console.log(`[SERVER] Attempting to listen on port ${port}...`);
  // Bind to 0.0.0.0, not 'localhost' — in a container/cloud deployment the platform's routing
  // layer connects from outside this process's network namespace, so a loopback-only bind
  // (127.0.0.1) accepts local connections but is unreachable from the outside, even though the
  // process starts and logs successfully.
  app.listen(Number(port), '0.0.0.0', () => {
    console.log(`[SERVER] Node Express server listening on 0.0.0.0:${port}`);
  });

  // Keep the process alive (prevents tsx from exiting after async IIFE completes)
  process.stdin.resume();

})();

export const reqHandler = createNodeRequestHandler(app);
