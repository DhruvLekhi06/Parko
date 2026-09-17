import { Router } from 'express';
import { many, one } from '../db.js';
import { parseJson, haversineM, ApiError } from '../util.js';
import { floorCounts, trendBaseline, formatVenue } from '../stats.js';
import { driveMatrix, driveRoute } from '../routing.js';
import { historyPoints } from '../history.js';

export const router = Router();

export const DEFAULT_ORIGIN = { lat: 12.9716, lng: 77.5946 };
export const origin = (q) => {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : { ...DEFAULT_ORIGIN };
};

router.get('/', async (req, res) => {
  const { type, ev, accessible, q, city } = req.query;
  const o = origin(req.query);
  const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const wantEv = !!ev && ev !== '0';
  const wantAccessible = !!accessible && accessible !== '0';
  const rows = (await many(`select * from venues where published`))
    .filter((v) => !type || v.type === type)
    .filter((v) => !city || v.city.toLowerCase() === String(city).toLowerCase())
    .filter((v) => {
      if (!wantEv && !wantAccessible) return true;
      const am = parseJson(v.amenities, []);
      return (!wantEv || am.includes('ev')) && (!wantAccessible || am.includes('accessible'));
    })
    .filter((v) => !needle || v.name.toLowerCase().includes(needle) || v.address.toLowerCase().includes(needle) || v.city.toLowerCase().includes(needle))
    .map((v) => ({ v, straightM: haversineM(o.lat, o.lng, v.lat, v.lng) }))
    .sort((a, b) => a.straightM - b.straightM);
  const nearestCity = rows[0]?.v.city || 'Bengaluru';
  const cities = [...rows.reduce((m, r) => m.set(r.v.city, (m.get(r.v.city) || 0) + 1), new Map())].map(([name, count]) => ({ name, count }));
  const scopeAll = !!city || !!needle || String(req.query.scope || '') === 'all';
  const scoped = scopeAll ? rows : rows.filter((r) => r.v.city === nearestCity);
  const [floors, baseline] = await Promise.all([floorCounts(), trendBaseline()]);
  const byVenue = new Map();
  for (const f of floors) (byVenue.get(f.venueId) || byVenue.set(f.venueId, []).get(f.venueId)).push(f);
  const near = scoped.filter((r) => r.straightM <= 60000).slice(0, 30).map((r) => ({ id: r.v.id, lat: r.v.lat, lng: r.v.lng }));
  const matrix = await driveMatrix(o, near);
  const venues = scoped.map(({ v }) => formatVenue(v, o, byVenue.get(v.id) || [], baseline, matrix.get(v.id))).sort((a, b) => a.distanceM - b.distanceM);
  res.json({ venues, origin: o, city: nearestCity, cities, etaSource: matrix.size ? 'road' : 'estimate' });
});

router.get('/:id', async (req, res) => {
  const row = await one(`select * from venues where id = $1 and published`, [req.params.id]);
  if (!row) throw new ApiError(404, 'VENUE_NOT_FOUND', `No venue ${req.params.id}`);
  const o = origin(req.query);
  const [floors, baseline, matrix, history] = await Promise.all([
    floorCounts(row.id), trendBaseline(row.id), driveMatrix(o, [{ id: row.id, lat: row.lat, lng: row.lng }]), historyPoints(row.id),
  ]);
  const venue = formatVenue(row, o, floors, baseline, matrix.get(row.id));
  venue.history = history.map((h) => ({ ts: h.ts.toISOString(), free: h.free }));
  res.json(venue);
});

router.get('/:id/directions', async (req, res) => {
  const row = await one(`select id, name, lat, lng from venues where id = $1`, [req.params.id]);
  if (!row) throw new ApiError(404, 'VENUE_NOT_FOUND', `No venue ${req.params.id}`);
  const o = origin(req.query);
  const route = await driveRoute(o, { lat: row.lat, lng: row.lng });
  if (route) return res.json({ venueId: row.id, origin: o, destination: { lat: row.lat, lng: row.lng }, ...route });
  const metres = Math.round(haversineM(o.lat, o.lng, row.lat, row.lng) * 1.3);
  res.json({ venueId: row.id, origin: o, destination: { lat: row.lat, lng: row.lng }, coordinates: [[o.lat, o.lng], [row.lat, row.lng]], metres, seconds: Math.round(metres / 6.7), source: 'estimate' });
});
