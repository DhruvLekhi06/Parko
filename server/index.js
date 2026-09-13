import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import { ROOT } from './util.js';
import * as db from './db.js';
import { seed } from './seed.js';
import { startSimulation } from './sim.js';
import { handleEvents, clientCount } from './sse.js';
import { router as venues } from './routes/venues.js';
import { router as floors } from './routes/floors.js';
import { router as reservations } from './routes/reservations.js';
import { router as sessions } from './routes/sessions.js';
import { router as users } from './routes/users.js';

const PORT = process.env.PORT || 3001;
const DIST = path.join(ROOT, 'client', 'dist');
const HAS_BUILD = existsSync(path.join(DIST, 'index.html'));
const PROD = process.env.NODE_ENV === 'production';

if (!db.isSeeded()) seed(db);
else {
  const { v, f, s } = db.get(`select (select count(*) from venues) as v, (select count(*) from floors) as f, (select count(*) from slots) as s`);
  console.log(`database ready: ${v} venues, ${f} floors, ${s} slots`);
}

const app = express();
app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
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

app.get('/api/health', (req, res) => {
  const { v, s } = db.get(`select (select count(*) from venues) as v, (select count(*) from slots) as s`);
  res.json({ ok: true, venues: v, slots: s, uptimeS: Math.round(process.uptime()), sseClients: clientCount() });
});
app.get('/api/events', handleEvents);
app.use('/api/venues', venues);
app.use('/api', floors);
app.use('/api/reservations', reservations);
app.use('/api/sessions', sessions);
app.use('/api/users', users);
app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route ${req.method} ${req.originalUrl}` } }));

if (HAS_BUILD) {
  app.use(express.static(DIST, { maxAge: '1h', index: false }));
  app.get('/{*path}', (req, res) => res.sendFile(path.join(DIST, 'index.html')));
} else if (PROD) {
  console.warn('client/dist/index.html not found, run `npm run build` to serve the app from this server');
}

app.use((err, req, res, next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  const code = typeof err.code === 'string' && status !== 500 ? err.code : status === 500 ? 'INTERNAL' : 'BAD_REQUEST';
  if (status === 500) console.error(err);
  res.status(status).json({ error: { code, message: status === 500 ? 'Something went wrong' : err.message } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SpotOn API listening on http://localhost:${PORT}${HAS_BUILD ? ' (serving client/dist)' : ''}`);
  startSimulation();
});
