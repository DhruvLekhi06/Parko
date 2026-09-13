import { all, get } from './db.js';
import { parseJson, istMinutes, haversineM } from './util.js';

const FLOOR_COUNTS = `select f.id, f.name, f.level, f.venue_id, count(*) as total, sum(s.status = 'free') as free,
  sum(s.status = 'free' and s.type = 'ev') as freeEv, sum(s.status = 'free' and s.type = 'accessible') as freeAccessible
  from floors f join slots s on s.floor_id = f.id`;

export function floorCounts(venueId) {
  const rows = venueId ? all(`${FLOOR_COUNTS} where f.venue_id = ? group by f.id order by f.level`, venueId) : all(`${FLOOR_COUNTS} group by f.id order by f.level`);
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, venueId: r.venue_id, total: r.total, free: r.free, freeEv: r.freeEv, freeAccessible: r.freeAccessible }));
}

export function levelOf(free, total) {
  const occ = total ? (total - free) / total : 0;
  if (free === 0 || occ >= 0.99) return 'full';
  if (occ >= 0.9) return 'almost_full';
  if (occ >= 0.6) return 'filling';
  return 'open';
}

export function trendOf(venueId, freeNow, total) {
  const then = get(`select free from availability_history where venue_id = ? and ts <= ? order by ts desc limit 1`,
    venueId, new Date(Date.now() - 30 * 60000).toISOString());
  if (!then) return 'steady';
  const delta = freeNow - then.free;
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

export function venueLive(venueId, floors = floorCounts(venueId)) {
  const sum = (k) => floors.reduce((a, f) => a + f[k], 0);
  const total = sum('total');
  const free = sum('free');
  return {
    venueId, total, free, freeEv: sum('freeEv'), freeAccessible: sum('freeAccessible'),
    occupancy: total ? Math.round(((total - free) / total) * 100) / 100 : 0,
    level: levelOf(free, total), trend: trendOf(venueId, free, total),
    floors: floors.map(({ id, name, level, total, free, freeEv, freeAccessible }) => ({ id, name, level, total, free, freeEv, freeAccessible })),
  };
}

export function formatVenue(row, origin, floors) {
  const live = venueLive(row.id, floors);
  const distanceM = haversineM(origin.lat, origin.lng, row.lat, row.lng);
  const { venueId, ...rest } = live;
  return {
    id: row.id, name: row.name, type: row.type, address: row.address, lat: row.lat, lng: row.lng,
    distanceM, etaMin: Math.max(1, Math.round(distanceM / 400)),
    opens: row.opens, closes: row.closes, is24h: !!row.is24h, isOpen: isOpenNow(row),
    amenities: parseJson(row.amenities, []), rate: parseJson(row.rate, {}), image: parseJson(row.image, {}),
    ...rest,
  };
}
