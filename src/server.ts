import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const browserDistFolder = join(__dirname, '../browser');

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.url.startsWith('/api/')) {
    console.log(`[API Request] ${req.method} ${req.url}`);
  }
  next();
});

let angularApp: AngularNodeAppEngine | undefined;
try {
  angularApp = new AngularNodeAppEngine();
} catch (err) {
  console.warn('AngularNodeAppEngine could not be initialized. Prerendering/SSR might be unavailable.', err);
}

app.get('/debug', (req: Request, res: Response) => {
  res.json({ url: req.url, headers: req.headers });
});

app.get('/test', (req: Request, res: Response) => {
  res.json({ message: 'API is working' });
});

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.url.startsWith('/api/')) {
     console.log(`[API] 404 Not Found: ${req.method} ${req.url}`);
     res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
     return;
  }
  next();
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req: Request, res: Response, next: NextFunction) => {
  if (angularApp) {
    angularApp
      .handle(req)
      .then((response) =>
        response ? writeResponseToNodeResponse(response, res) : next(),
      )
      .catch((err) => {
        console.error('Angular rendering error:', err);
        next();
      });
  } else {
    next();
  }
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
// Forced startup for debugging
const shouldStart = true; 
if (shouldStart) {
  const port = process.env['SERVER_PORT'] || process.env['PORT'] || 4000;
  console.log(`[SERVER] Attempting to listen on port ${port}...`);
  app.listen(port, () => {
    console.log(`[SERVER] Node Express server listening on http://0.0.0.0:${port}`);
  });
} else {
  console.log('[SERVER] Not starting standalone server (not main module)');
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
