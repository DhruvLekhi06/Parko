import { Router } from 'express';
import { many } from '../db.js';
import { floorCounts, trendBaseline, venueLive } from '../stats.js';
import { activeHold, formatHold } from '../records.js';
import { currentUser } from './users.js';

export const router = Router();

router.get('/', async (req, res) => {
  const ids = String(req.query.venues || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const floorId = String(req.query.floor || '').trim();
  const out = { at: new Date().toISOString(), venues: [], slots: [], hold: null };
  if (ids.length) {
    const [floors, baseline] = await Promise.all([floorCounts(ids), trendBaseline(ids)]);
    const byVenue = new Map();
    for (const f of floors) (byVenue.get(f.venueId) || byVenue.set(f.venueId, []).get(f.venueId)).push(f);
    out.venues = ids.filter((id) => byVenue.has(id)).map((id) => venueLive(id, byVenue.get(id), baseline));
  }
  if (floorId) out.slots = await many(`select id, status from slots where floor_id = $1`, [floorId]);
  if (req.get('Authorization') || req.get('X-User-Id')) {
    try {
      const user = await currentUser(req);
      const h = await activeHold(user.id);
      out.hold = h ? formatHold(h) : null;
    } catch {
      out.hold = null;
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json(out);
});
