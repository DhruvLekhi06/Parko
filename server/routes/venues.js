import { Router } from 'express';
import { all, get } from '../db.js';
import { parseJson, ApiError } from '../util.js';
import { floorCounts, formatVenue } from '../stats.js';

export const router = Router();

const origin = (q) => ({ lat: Number(q.lat) || 12.9716, lng: Number(q.lng) || 77.5946 });

router.get('/', (req, res) => {
  const { type, ev, accessible, q } = req.query;
  const byVenue = new Map();
  for (const f of floorCounts()) (byVenue.get(f.venueId) || byVenue.set(f.venueId, []).get(f.venueId)).push(f);
  const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
  const wantEv = !!ev && ev !== '0';
  const wantAccessible = !!accessible && accessible !== '0';
  const venues = all(`select * from venues`)
    .filter((v) => !type || v.type === type)
    .filter((v) => {
      if (!wantEv && !wantAccessible) return true;
      const am = parseJson(v.amenities, []);
      return (!wantEv || am.includes('ev')) && (!wantAccessible || am.includes('accessible'));
    })
    .filter((v) => !needle || v.name.toLowerCase().includes(needle) || v.address.toLowerCase().includes(needle))
    .map((v) => formatVenue(v, origin(req.query), byVenue.get(v.id) || []))
    .sort((a, b) => a.distanceM - b.distanceM);
  res.json({ venues });
});

router.get('/:id', (req, res) => {
  const row = get(`select * from venues where id = ?`, req.params.id);
  if (!row) throw new ApiError(404, 'VENUE_NOT_FOUND', `No venue ${req.params.id}`);
  const venue = formatVenue(row, origin(req.query), floorCounts(row.id));
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  venue.history = all(`select ts, free from availability_history where venue_id = ? and ts >= ? order by ts`, row.id, since)
    .filter((h) => new Date(h.ts).getUTCMinutes() % 10 === 0)
    .map((h) => ({ ts: h.ts, free: h.free }));
  res.json(venue);
});
