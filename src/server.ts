import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const browserDistFolder = join(__dirname, '../browser');

interface DashboardUser {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  lastLogin: string;
  role?: 'admin' | 'seller' | 'buyer';
}

interface DashboardListing {
  id: string;
  uid: string;
  name: string;
  category: string;
  status: 'active' | 'draft' | 'archived';
  priceINR: number;
  originalImage?: string;
  processedImage?: string;
  createdAt: string;
}

const app = express();
app.use(express.json());

const useMongoDataApi = Boolean(process.env['MONGODB_DATA_API_URL'] && process.env['MONGODB_DATA_API_KEY']);

async function runMongoDataApi<T>(collection: string): Promise<T[]> {
  const response = await fetch(`${process.env['MONGODB_DATA_API_URL']}/action/find`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env['MONGODB_DATA_API_KEY'] || '',
    },
    body: JSON.stringify({
      dataSource: process.env['MONGODB_DATA_SOURCE'] || 'Cluster0',
      database: process.env['MONGODB_DATABASE'] || 'ecommerce',
      collection,
      filter: {},
    }),
  });

  if (!response.ok) throw new Error(`MongoDB Data API failed: ${response.status}`);
  const json = await response.json() as { documents?: T[] };
  return json.documents || [];
}

function getFallbackUsers(): DashboardUser[] {
  return [
    { uid: 'u1', email: 'ava@shop.com', displayName: 'Ava Carter', photoURL: null, lastLogin: new Date().toISOString(), role: 'admin' },
    { uid: 'u2', email: 'liam@shop.com', displayName: 'Liam Fox', photoURL: null, lastLogin: new Date(Date.now() - 3600000).toISOString(), role: 'seller' },
    { uid: 'u3', email: 'mia@shop.com', displayName: 'Mia Khan', photoURL: null, lastLogin: new Date(Date.now() - 7200000).toISOString(), role: 'buyer' },
  ];
}

function getFallbackListings(): DashboardListing[] {
  return [
    { id: 'l1', uid: 'u2', name: 'Nike Pro Sneakers', category: 'Shoes', status: 'active', priceINR: 4899, createdAt: new Date().toISOString() },
    { id: 'l2', uid: 'u2', name: 'Leather Wallet', category: 'Accessories', status: 'draft', priceINR: 1299, createdAt: new Date(Date.now() - 86400000).toISOString() },
    { id: 'l3', uid: 'u3', name: 'Smart Lamp', category: 'Electronics', status: 'archived', priceINR: 2199, createdAt: new Date(Date.now() - 172800000).toISOString() },
  ];
}

app.get('/api/admin/dashboard', async (_req: Request, res: Response) => {
  try {
    const users = useMongoDataApi ? await runMongoDataApi<DashboardUser>('users') : getFallbackUsers();
    const listings = useMongoDataApi ? await runMongoDataApi<DashboardListing>('listings') : getFallbackListings();
    res.json({ users, listings, source: useMongoDataApi ? 'mongodb' : 'fallback' });
  } catch (error) {
    console.error('Dashboard API error:', error);
    res.status(500).json({ error: 'Unable to fetch dashboard data' });
  }
});

let angularApp: AngularNodeAppEngine | undefined;
try {
  angularApp = new AngularNodeAppEngine();
} catch (err) {
  console.warn('AngularNodeAppEngine could not be initialized.', err);
}

app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }));

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!angularApp) return next();
  angularApp.handle(req)
    .then((response) => response ? writeResponseToNodeResponse(response, res) : next())
    .catch(next);
});

const port = process.env['SERVER_PORT'] || process.env['PORT'] || 4000;
app.listen(port, () => console.log(`[SERVER] listening http://0.0.0.0:${port}`));

export const reqHandler = createNodeRequestHandler(app);
