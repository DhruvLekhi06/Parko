import { many } from './db.js';
import { parseJson, istMinutes, haversineM } from './util.js';

const FLOOR_COUNTS = `select f.id, f.name, f.level, f.venue_id, count(*)::int as total,
  count(*) filter (where s.status = 'free')::int as free,
  count(*) filter (where s.status = 'free' and s.type = 'ev')::int as free_ev,
  count(*) filter (where s.status = 'free' and s.type = 'accessible')::int as free_accessible
  from floors f join slots s on s.floor_id = f.id`;

export async function floorCounts(venueId) {
  const rows = Array.isArray(venueId)
    ? await many(`${FLOOR_COUNTS} where f.venue_id = any($1) group by f.id order by f.level`, [venueId])
    : venueId
      ? await many(`${FLOOR_COUNTS} where f.venue_id = $1 group by f.id order by f.level`, [venueId])
      : await many(`${FLOOR_COUNTS} group by f.id order by f.level`);
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, venueId: r.venue_id, total: r.total, free: r.free, freeEv: r.free_ev, freeAccessible: r.free_accessible }));
}

export async function trendBaseline(venueId) {
  const cutoff = new Date(Date.now() - 30 * 60000).toISOString();
  const rows = Array.isArray(venueId)
    ? await many(`select distinct on (venue_id) venue_id, free from availability_history where venue_id = any($1) and ts <= $2 and ts >= $3 order by venue_id, ts desc`, [venueId, cutoff, new Date(Date.now() - 3 * 3600000).toISOString()])
    : venueId
      ? await many(`select venue_id, free from availability_history where venue_id = $1 and ts <= $2 order by ts desc limit 1`, [venueId, cutoff])
      : await many(`select distinct on (venue_id) venue_id, free from availability_history where ts <= $1 and ts >= $2 order by venue_id, ts desc`, [cutoff, new Date(Date.now() - 3 * 3600000).toISOString()]);
  return new Map(rows.map((r) => [r.venue_id, r.free]));
}

export function levelOf(free, total) {
  const occ = total ? (total - free) / total : 0;
  if (free === 0 || occ >= 0.99) return 'full';
  if (occ >= 0.9) return 'almost_full';
  if (occ >= 0.6) return 'filling';
  return 'open';
}

export function trendOf(thenFree, freeNow, total) {
  if (thenFree == null) return 'steady';
  const delta = freeNow - thenFree;
  if (Math.abs(delta) <= Math.max(2, total * 0.03)) return 'steady';
  return delta > 0 ? 'rising' : 'falling';
}

export function isOpenNow(v) {
  if (v.is24h) return true;
  const [oh, om] = v.opens.split(':').map(Number);
  const [ch, cm] = v.closes.split(':').map(Number);
  const now = istMinutes();
  const open = oh * 60 + om;
  const close = ch * 60 + cm;
  return close > open ? now >= open && now < close : now >= open || now < close;
}

export function venueLive(venueId, floors, baseline) {
  const sum = (k) => floors.reduce((a, f) => a + f[k], 0);
  const total = sum('total');
  const free = sum('free');
  return {
    venueId, total, free, freeEv: sum('freeEv'), freeAccessible: sum('freeAccessible'),
    occupancy: total ? Math.round(((total - free) / total) * 100) / 100 : 0,
    level: levelOf(free, total), trend: trendOf(baseline?.get(venueId), free, total),
    floors: floors.map(({ id, name, level, total, free, freeEv, freeAccessible }) => ({ id, name, level, total, free, freeEv, freeAccessible })),
  };
}

export async function liveFor(venueId) {
  const [floors, baseline] = await Promise.all([floorCounts(venueId), trendBaseline(venueId)]);
  return venueLive(venueId, floors, baseline);
}

export function formatVenue(row, origin, floors, baseline, road) {
  const live = venueLive(row.id, floors, baseline);
  const straightM = haversineM(origin.lat, origin.lng, row.lat, row.lng);
  const distanceM = road ? road.metres : straightM;
  const etaMin = road ? Math.max(1, Math.round(road.seconds / 60)) : Math.max(1, Math.round((straightM * 1.3) / 400));
  const { venueId, ...rest } = live;
  const rate = parseJson(row.rate, {});
  return {
    id: row.id, name: row.name, type: row.type, city: row.city, address: row.address, lat: row.lat, lng: row.lng,
    distanceM, etaMin, etaSource: road ? 'road' : 'estimate',
    opens: row.opens, closes: row.closes, is24h: !!row.is24h, isOpen: isOpenNow(row),
    amenities: parseJson(row.amenities, []), rate, holdFee: rate.holdFee ?? 0, image: parseJson(row.image, {}),
    ...rest,
  };
}
