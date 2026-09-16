import { Router } from 'express';
import { many, one } from '../db.js';
import { parseJson, ApiError } from '../util.js';
import { buildRoute } from '../layout.js';
import { currentUser } from './users.js';

export const router = Router();

export const slotOut = (s) => ({ id: s.id, code: s.code, x: s.x, y: s.y, w: s.w, h: s.h, type: s.type, status: s.status, distToEntrance: s.dist_to_entrance });

export async function recommendedSlotId(floorId, prefs) {
  const pick = (type) => one(`select id from slots where floor_id = $1 and status = 'free' and type = $2 order by dist_to_entrance, code limit 1`, [floorId, type]);
  const hit = (prefs.needsAccessible && (await pick('accessible'))) || (prefs.needsEv && (await pick('ev'))) || (await pick('standard'))
    || (await one(`select id from slots where floor_id = $1 and status = 'free' order by dist_to_entrance, code limit 1`, [floorId]));
  return hit ? hit.id : null;
}

export async function bestSlotForVenue(venueId, prefs) {
  const pick = (type) => one(`select s.id from slots s join floors f on f.id = s.floor_id where f.venue_id = $1 and s.status = 'free' and s.type = $2
    order by abs(f.level), s.dist_to_entrance, s.code limit 1`, [venueId, type]);
  const hit = (prefs.needsAccessible && (await pick('accessible'))) || (prefs.needsEv && (await pick('ev'))) || (await pick('standard'))
    || (await one(`select s.id from slots s join floors f on f.id = s.floor_id where f.venue_id = $1 and s.status = 'free' order by abs(f.level), s.dist_to_entrance limit 1`, [venueId]));
  return hit ? hit.id : null;
}

router.get('/floors/:id', async (req, res) => {
  const f = await one(`select f.*, v.name as venue_name from floors f join venues v on v.id = f.venue_id where f.id = $1`, [req.params.id]);
  if (!f) throw new ApiError(404, 'FLOOR_NOT_FOUND', `No floor ${req.params.id}`);
  const layout = parseJson(f.layout, {});
  const [slots, user] = await Promise.all([many(`select * from slots where floor_id = $1 order by code`, [f.id]), currentUser(req)]);
  res.json({
    id: f.id, venueId: f.venue_id, name: f.name, level: f.level, width: f.width, height: f.height,
    ...layout, slots: slots.map(slotOut), venue: { id: f.venue_id, name: f.venue_name },
    recommendedSlotId: await recommendedSlotId(f.id, user.prefs),
  });
});

router.get('/route', async (req, res) => {
  const slotId = String(req.query.slotId || '');
  const s = await one(`select s.*, f.layout from slots s join floors f on f.id = s.floor_id where s.id = $1`, [slotId]);
  if (!s) throw new ApiError(404, 'SLOT_NOT_FOUND', `No slot ${slotId}`);
  const route = buildRoute(parseJson(s.layout, {}), slotOut(s));
  if (!route) throw new ApiError(422, 'NO_ROUTE', `Slot ${s.code} is not reachable from an entrance`);
  res.json({ floorId: s.floor_id, slotId: s.id, ...route });
});
