import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ROOT, PROD, SIM_ON, SYNTHETIC } from './util.js';
import { migrate, isSeeded, one } from './db.js';
import { seed } from './seed.js';
import { backfillHistory, sampleHistory } from './history.js';
import { expireHolds } from './state.js';
import { handleEvents, clientCount } from './sse.js';
import { routingStatus } from './routing.js';
import { rateLimit } from './ratelimit.js';
import { router as venues } from './routes/venues.js';
import { router as floors } from './routes/floors.js';
import { router as holds } from './routes/holds.js';
import { router as sessions } from './routes/sessions.js';
import { router as users, vehicles, wallet, auth } from './routes/users.js';
import { router as admin } from './routes/admin.js';
import { router as live } from './routes/live.js';

export const SERVERLESS = !!process.env.VERCEL || process.env.SERVERLESS === '1';
const DIST = path.join(ROOT, 'client', 'dist');
const HAS_BUILD = !SERVERLESS && existsSync(path.join(DIST, 'index.html'));
const ORIGINS = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);

let readyPromise = null;
export function ready() {
  if (!readyPromise) {
    readyPromise = (async () => {
      if (PROD) {
        const missing = ['DATABASE_URL', 'SESSION_SECRET', 'ADMIN_KEY'].filter((k) => !process.env[k]);
        if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
      }
      if (!SERVERLESS || process.env.MIGRATE_ON_BOOT === '1') {
        await migrate();
        if (!(await isSeeded())) await seed();
        else {
          const { v, f, s } = await one(`select (select count(*) from venues) as v, (select count(*) from floors) as f, (select count(*) from slots) as s`);
          console.log(`database ready: ${v} venues, ${f} floors, ${s} slots`);
        }
        await backfillHistory();
      }
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  }
  return readyPromise;
}

const last = { expire: 0, sample: 0 };
async function maintenance() {
  const now = Date.now();
  if (now - last.expire > 5000) {
    last.expire = now;
    await expireHolds().catch((e) => console.error('expiry failed:', e.message));
  }
  if (now - last.sample > 600000) {
    last.sample = now;
    sampleHistory().catch((e) => console.error('history failed:', e.message));
  }
}

export const app = express();
app.disable('x-powered-by');
app.set('etag', false);
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const reqOrigin = req.get('Origin');
  const allow = ORIGINS.includes('*') ? '*' : ORIGINS.includes(reqOrigin) ? reqOrigin : ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Admin-Key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=(), payment=()');
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
if (!PROD) {
  app.use((req, res, next) => {
    const t = performance.now();
    res.on('finish', () => console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Math.round(performance.now() - t)}ms`));
    next();
  });
}
if (SERVERLESS) {
  app.use('/api', async (req, res, next) => {
    try {
      await ready();
      if (req.path !== '/health') await maintenance();
      next();
    } catch (e) {
      next(e);
    }
  });
}
app.use('/api', (req, res, next) => (req.method === 'GET' ? next() : rateLimit({ windowMs: 60000, max: 120, key: 'write' })(req, res, next)));

app.get('/api/health', async (req, res) => {
  const { v, s } = await one(`select (select count(*) from venues) as v, (select count(*) from slots) as s`);
  res.json({ ok: true, venues: v, slots: s, uptimeS: Math.round(process.uptime()), sseClients: clientCount(), routing: routingStatus(), simulation: SIM_ON, synthetic: SYNTHETIC, serverless: SERVERLESS });
});
if (SERVERLESS) app.get('/api/events', (req, res) => res.status(404).json({ error: { code: 'NO_STREAM', message: 'Live stream is not available here, poll /api/live' } }));
else app.get('/api/events', handleEvents);
app.use('/api/live', live);
app.use('/api/auth', auth);
app.use('/api/venues', venues);
app.use('/api', floors);
app.use('/api/holds', holds);
app.use('/api/reservations', holds);
app.use('/api/sessions', sessions);
app.use('/api/users', users);
app.use('/api/vehicles', vehicles);
app.use('/api/wallet', wallet);
app.use('/api/admin', admin);
app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.originalUrl}` } }));

if (HAS_BUILD) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  const code = typeof err.code === 'string' && status !== 500 ? err.code : status === 500 ? 'INTERNAL' : 'BAD_REQUEST';
  if (status === 500) console.error(err);
  res.status(status).json({ error: { code, message: status === 500 ? 'Something went wrong' : err.message, ...(err.extra ? { details: err.extra } : {}) } });
});
