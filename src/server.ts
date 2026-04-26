import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const browserDistFolder = join(__dirname, '../browser');

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[REQUEST LOG] ${req.method} ${req.url}`);
  if (req.url.startsWith('/api/')) {
    console.log(`[API Request] ${req.method} ${req.url}`);
  }
  next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[DEBUG] Request: ${req.method} ${req.url}`);
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

/**
 * Endpoint to send OTP via email.
 */
app.post('/send-otp', async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  console.log(`[API] Received OTP request for ${email}`);

  if (!email || !otp) {
    res.status(400).json({ error: 'Email and OTP are required' });
    return;
  }

  // Use environment variables for SMTP configuration
  const transporter = nodemailer.createTransport({
    host: process.env['SMTP_HOST'] as string,
    port: parseInt(process.env['SMTP_PORT'] || '587'),
    secure: process.env['SMTP_PORT'] === '465',
    auth: {
      user: process.env['SMTP_USER'] as string,
      pass: process.env['SMTP_PASS'] as string,
    },
  });

  const mailOptions = {
    from: process.env['SMTP_FROM'] || '"SellAssist" <no-reply@sellassist.ai>',
    to: email,
    subject: 'Your SellAssist Verification Code',
    text: `Your verification code is: ${otp}`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;">
        <h2 style="color: #f97316;">SellAssist Verification</h2>
        <p>Hello,</p>
        <p>Thank you for registering with SellAssist. Please use the following code to complete your registration:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; text-align: center; padding: 20px; background: #fff7ed; border-radius: 10px; color: #ea580c; margin: 20px 0;">
          ${otp}
        </div>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">&copy; 2025 SellAssist. All rights reserved.</p>
      </div>
    `,
  };

  try {
    // If no SMTP config, we just "simulate" it in dev
    if (!process.env['SMTP_USER']) {
      console.log('--- SIMULATED EMAIL ---');
      console.log(`To: ${email}`);
      console.log(`Subject: ${mailOptions.subject}`);
      console.log(`OTP: ${otp}`);
      console.log('------------------------');
      res.json({ success: true, message: 'OTP simulated (No SMTP config)' });
      return;
    }

    await transporter.sendMail(mailOptions);
    res.json({ success: true });
    return;
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
    return;
  }
});

app.get('/test', (req: Request, res: Response) => {
  res.json({ message: 'API is working' });
});

app.all('/*', (req: Request, res: Response, next: NextFunction) => {
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
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 3000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://0.0.0.0:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
