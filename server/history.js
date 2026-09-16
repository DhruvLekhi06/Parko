import { many, query } from './db.js';
import { istHour, mulberry32, hashStr } from './util.js';
import { targetOccupancy } from './demand.js';

export function synthHistory(venueId, type, total, now, anchorFree) {
  const rng = mulberry32(hashStr(`${venueId}:history:${Math.floor(now.getTime() / 86400000)}`));
  const start = Math.floor(now.getTime() / 60000) * 60000 - 24 * 60 * 60000;
  const out = [];
  let noise = 0;
  for (let i = 0; i <= 24 * 60; i++) {
    const t = new Date(start + i * 60000);
    noise = Math.max(-0.06, Math.min(0.06, noise + (rng() - 0.5) * 0.01));
    const occ = Math.min(0.99, Math.max(0.01, targetOccupancy(type, istHour(t)) + noise));
    out.push({ ts: t.toISOString(), free: Math.round(total * (1 - occ)) });
  }
  if (anchorFree != null && out.length) {
    const drift = anchorFree - out[out.length - 1].free;
    const n = Math.min(90, out.length);
    for (let i = 0; i < n; i++) {
      const p = out[out.length - 1 - i];
      p.free = Math.max(0, Math.min(total, Math.round(p.free + drift * (1 - i / n))));
    }
  }
  return out;
}

export async function insertHistory(venueId, points) {
  if (!points.length) return;
  const values = [];
  const params = [venueId];
  points.forEach((p, i) => {
    params.push(p.ts, p.free);
    values.push(`($1, $${i * 2 + 2}, $${i * 2 + 3})`);
  });
  await query(`insert into availability_history (venue_id, ts, free) values ${values.join(',')} on conflict (venue_id, ts) do update set free = excluded.free`, params);
}

export async function backfillHistory({ log = console.log } = {}) {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const rows = await many(`
    select v.id, v.type,
      (select count(*)::int from slots s join floors f on f.id = s.floor_id where f.venue_id = v.id) as total,
      (select count(*)::int from slots s join floors f on f.id = s.floor_id where f.venue_id = v.id and s.status = 'free') as free,
      (select count(*)::int from availability_history h where h.venue_id = v.id and h.ts >= $1) as points
    from venues v`, [since]);
  let filled = 0;
  const now = new Date();
  for (const v of rows) {
    if (v.points >= 24 * 60 * 0.8) continue;
    const existing = new Set((await many(`select ts from availability_history where venue_id = $1 and ts >= $2`, [v.id, since])).map((r) => r.ts.toISOString()));
    const points = synthHistory(v.id, v.type, v.total, now, v.free).filter((p) => !existing.has(p.ts));
    await insertHistory(v.id, points);
    filled++;
  }
  if (filled) log(`backfilled 24h availability history for ${filled} venues`);
  return filled;
}

export async function sampleHistory() {
  const ts = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
  const rows = await many(`select v.id, count(*) filter (where s.status = 'free')::int as free
    from venues v join floors f on f.venue_id = v.id join slots s on s.floor_id = f.id group by v.id`);
  if (!rows.length) return;
  const values = [];
  const params = [ts];
  rows.forEach((r, i) => {
    params.push(r.id, r.free);
    values.push(`($${i * 2 + 2}, $1, $${i * 2 + 3})`);
  });
  await query(`insert into availability_history (venue_id, ts, free) values ${values.join(',')} on conflict (venue_id, ts) do update set free = excluded.free`, params);
  await query(`delete from availability_history where ts < $1`, [new Date(Date.now() - 25 * 3600000).toISOString()]);
}

export const historyPoints = (venueId) =>
  many(`select ts, free from availability_history where venue_id = $1 and ts >= $2 and extract(minute from ts)::int % 10 = 0 order by ts`, [venueId, new Date(Date.now() - 24 * 3600000).toISOString()]);
