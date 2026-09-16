import { many, one, run, tx } from './db.js';
import { broadcast } from './sse.js';
import { liveFor } from './stats.js';

const pending = new Map();

export function notifyVenue(venueId) {
  const entry = pending.get(venueId);
  if (entry) { entry.dirty = true; return; }
  const next = { dirty: false };
  pending.set(venueId, next);
  next.timer = setTimeout(() => { pending.delete(venueId); if (next.dirty) notifyVenue(venueId); }, 2000);
  next.timer.unref();
  setTimeout(() => liveFor(venueId).then((live) => broadcast('venue', live)).catch(() => {}), 0);
}

export async function setSlotStatus(slotId, status) {
  const row = await one(`update slots s set status = $1, updated_at = now() from floors f where f.id = s.floor_id and s.id = $2 returning s.floor_id, f.venue_id`, [status, slotId]);
  if (!row) return;
  broadcast('slot', { slotId, floorId: row.floor_id, venueId: row.venue_id, status });
  notifyVenue(row.venue_id);
}

export async function expireHolds() {
  const due = await many(`select h.id, h.slot_id, s.status as slot_status from holds h join slots s on s.id = h.slot_id
    where h.status = 'active' and h.expires_at <= now()`);
  for (const h of due) {
    await tx(async () => {
      await run(`update holds set status = 'expired' where id = $1`, [h.id]);
      if (h.slot_status === 'reserved') await setSlotStatus(h.slot_id, 'free');
    });
    broadcast('hold', { id: h.id, status: 'expired' });
    broadcast('reservation', { id: h.id, status: 'expired' });
  }
  return due.length;
}
