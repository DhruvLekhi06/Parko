import { Router } from 'express';
import { all, get } from '../db.js';
import { parseJson, ApiError } from '../util.js';
import { buildRoute } from '../layout.js';
import { currentUser } from './users.js';

export const router = Router();

const slotOut = (s) => ({ id: s.id, code: s.code, x: s.x, y: s.y, w: s.w, h: s.h, type: s.type, status: s.status, distToEntrance: s.dist_to_entrance });

function recommendedSlotId(floorId, prefs) {
  const pick = (type) => get(`select id from slots where floor_id = ? and status = 'free' and type = ? order by dist_to_entrance, code limit 1`, floorId, type);
  const hit = (prefs.needsAccessible && pick('accessible')) || (prefs.needsEv && pick('ev')) || pick('standard')
    || get(`select id from slots where floor_id = ? and status = 'free' order by dist_to_entrance, code limit 1`, floorId);
  return hit ? hit.id : null;
}

router.get('/floors/:id', (req, res) => {
  const f = get(`select f.*, v.name as venue_name from floors f join venues v on v.id = f.venue_id where f.id = ?`, req.params.id);
  if (!f) throw new ApiError(404, 'FLOOR_NOT_FOUND', `No floor ${req.params.id}`);
  const layout = parseJson(f.layout, {});
  const slots = all(`select * from slots where floor_id = ? order by code`, f.id).map(slotOut);
  res.json({
    id: f.id, venueId: f.venue_id, name: f.name, level: f.level, width: f.width, height: f.height,
    ...layout, slots, venue: { id: f.venue_id, name: f.venue_name },
    recommendedSlotId: recommendedSlotId(f.id, currentUser(req).prefs),
  });
});

router.get('/route', (req, res) => {
  const slotId = String(req.query.slotId || '');
  const s = get(`select s.*, f.layout from slots s join floors f on f.id = s.floor_id where s.id = ?`, slotId);
  if (!s) throw new ApiError(404, 'SLOT_NOT_FOUND', `No slot ${slotId}`);
  const route = buildRoute(parseJson(s.layout, {}), slotOut(s));
  if (!route) throw new ApiError(422, 'NO_ROUTE', `Slot ${s.code} is not reachable from an entrance`);
  res.json({ floorId: s.floor_id, slotId: s.id, ...route });
});
