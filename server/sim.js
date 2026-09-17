import { many, one } from './db.js';
import { istHour, SIM_ON } from './util.js';
import { targetOccupancy } from './demand.js';
import { setSlotStatus, expireHolds } from './state.js';
import { sampleHistory } from './history.js';

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

export async function tick() {
  const venues = await many(`select v.id, v.type, count(*)::int as total, count(*) filter (where s.status = 'occupied')::int as occupied
    from venues v join floors f on f.venue_id = v.id join slots s on s.floor_id = f.id group by v.id, v.type`);
  if (!venues.length) return;
  const hour = istHour();
  const flips = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < flips; i++) {
    const v = pickVenue(venues);
    const target = targetOccupancy(v.type, hour, v.type === 'stadium' && stadiumSpike(v.id));
    const occ = v.occupied / v.total;
    const pOccupy = Math.min(0.9, Math.max(0.1, 0.5 + (target - occ) * 4));
    const toOccupied = Math.random() < pOccupy;
    const slot = toOccupied
      ? await one(`select s.id from slots s join floors f on f.id = s.floor_id where f.venue_id = $1 and s.status = 'free' order by random() limit 1`, [v.id])
      : await one(`select s.id from slots s join floors f on f.id = s.floor_id where f.venue_id = $1 and s.status = 'occupied'
          and not exists (select 1 from sessions p where p.slot_id = s.id and p.ended_at is null) order by random() limit 1`, [v.id]);
    if (!slot) continue;
    await setSlotStatus(slot.id, toOccupied ? 'occupied' : 'free');
    v.occupied += toOccupied ? 1 : -1;
  }
}

function guarded(fn, label) {
  let busy = false;
  return async () => {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { console.error(`${label} failed:`, e.message); } finally { busy = false; }
  };
}

export function startSimulation() {
  guarded(expireHolds, 'expiry')();
  if (SIM_ON) setInterval(guarded(tick, 'sim'), TICK_MS);
  setInterval(guarded(expireHolds, 'expiry'), 5000);
  setInterval(guarded(sampleHistory, 'history'), 600000);
}
