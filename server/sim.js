import { all, get, run } from './db.js';
import { istHour } from './util.js';
import { targetOccupancy } from './demand.js';
import { setSlotStatus, expireReservations } from './state.js';

const TICK_MS = Number(process.env.SIM_INTERVAL_MS) || 4000;
const spikes = new Map();

function pickVenue(venues) {
  const total = venues.reduce((a, v) => a + v.total, 0);
  let r = Math.random() * total;
  for (const v of venues) { r -= v.total; if (r <= 0) return v; }
  return venues[venues.length - 1];
}

function stadiumSpike(venueId) {
  const until = spikes.get(venueId) || 0;
  if (until > Date.now()) return true;
  if (Math.random() < 0.002) { spikes.set(venueId, Date.now() + (10 + Math.random() * 10) * 60000); return true; }
  return false;
}

export function tick() {
  const venues = all(`select v.id, v.type, count(*) as total, sum(s.status = 'occupied') as occupied
    from venues v join floors f on f.venue_id = v.id join slots s on s.floor_id = f.id group by v.id`);
  const hour = istHour();
  const flips = 1 + Math.floor(Math.random() * 3);
  for (let i = 0; i < flips; i++) {
    const v = pickVenue(venues);
    const target = targetOccupancy(v.type, hour, v.type === 'stadium' && stadiumSpike(v.id));
    const occ = v.occupied / v.total;
    const pOccupy = Math.min(0.9, Math.max(0.1, 0.5 + (target - occ) * 4));
    const toOccupied = Math.random() < pOccupy;
    const slot = toOccupied
      ? get(`select s.id from slots s join floors f on f.id = s.floor_id where f.venue_id = ? and s.status = 'free' order by random() limit 1`, v.id)
      : get(`select s.id from slots s join floors f on f.id = s.floor_id where f.venue_id = ? and s.status = 'occupied'
          and s.id not in (select slot_id from sessions where ended_at is null) order by random() limit 1`, v.id);
    if (!slot) continue;
    setSlotStatus(slot.id, toOccupied ? 'occupied' : 'free');
    v.occupied += toOccupied ? 1 : -1;
  }
}

export function sampleHistory() {
  const ts = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const rows = all(`select v.id, sum(s.status = 'free') as free from venues v join floors f on f.venue_id = v.id join slots s on s.floor_id = f.id group by v.id`);
  for (const r of rows) run(`insert or replace into availability_history (venue_id, ts, free) values (?, ?, ?)`, r.id, ts, r.free);
  run(`delete from availability_history where ts < ?`, new Date(Date.now() - 24 * 3600000).toISOString());
}

export function startSimulation() {
  expireReservations();
  setInterval(tick, TICK_MS);
  setInterval(expireReservations, 5000);
  setInterval(sampleHistory, 60000);
}
