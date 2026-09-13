import { all, get, run, tx } from './db.js';
import { nowIso } from './util.js';
import { broadcast } from './sse.js';
import { venueLive } from './stats.js';

const pending = new Map();

export function notifyVenue(venueId) {
  const entry = pending.get(venueId);
  if (entry) { entry.dirty = true; return; }
  broadcast('venue', venueLive(venueId));
  const next = { dirty: false };
  next.timer = setTimeout(() => { pending.delete(venueId); if (next.dirty) notifyVenue(venueId); }, 2000);
  next.timer.unref();
  pending.set(venueId, next);
}

export function setSlotStatus(slotId, status) {
  const row = get(`select s.floor_id as floorId, f.venue_id as venueId from slots s join floors f on f.id = s.floor_id where s.id = ?`, slotId);
  if (!row) return;
  run(`update slots set status = ?, updated_at = ? where id = ?`, status, nowIso(), slotId);
  broadcast('slot', { slotId, floorId: row.floorId, venueId: row.venueId, status });
  notifyVenue(row.venueId);
}

export function expireReservations() {
  const now = nowIso();
  const due = all(`select r.id, r.slot_id as slotId, s.status as slotStatus from reservations r join slots s on s.id = r.slot_id
    where r.status = 'active' and r.expires_at <= ?`, now);
  for (const r of due) {
    tx(() => {
      run(`update reservations set status = 'expired' where id = ?`, r.id);
      if (r.slotStatus === 'reserved') setSlotStatus(r.slotId, 'free');
    });
    broadcast('reservation', { id: r.id, status: 'expired' });
  }
  return due.length;
}

export const activeSessionSlotIds = () => all(`select slot_id from sessions where ended_at is null`).map((r) => r.slot_id);
