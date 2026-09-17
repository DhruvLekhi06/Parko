import { Router } from 'express';
import { many, one, run, tx } from '../db.js';
import { ApiError, parseJson } from '../util.js';
import { setSlotStatus } from '../state.js';
import { PROD } from '../util.js';
import { formatHold, formatSession } from '../records.js';

const KEY = process.env.ADMIN_KEY || (PROD ? '' : 'spoton-admin');
const IST_DAY = `(date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')`;

export const router = Router();

router.use((req, res, next) => {
  if (!KEY || req.get('X-Admin-Key') !== KEY) throw new ApiError(401, 'ADMIN_KEY', 'Operator key required');
  next();
});

router.get('/overview', async (req, res) => {
  const o = await one(`select
    (select count(*) from venues)::int as venues,
    (select count(*) from slots)::int as slots,
    (select count(*) from slots where status = 'free')::int as free,
    (select count(*) from slots where status = 'occupied')::int as occupied,
    (select count(*) from slots where status = 'reserved')::int as reserved,
    (select count(*) from holds where status = 'active')::int as active_holds,
    (select count(*) from sessions where ended_at is null)::int as active_sessions,
    (select count(*) from users)::int as users,
    (select coalesce(sum(-amount), 0) from transactions where amount < 0 and created_at >= ${IST_DAY})::int as revenue_today,
    (select coalesce(sum(-amount), 0) from transactions where kind = 'hold_fee' and created_at >= ${IST_DAY})::int as hold_revenue_today,
    (select coalesce(sum(-amount), 0) from transactions where kind = 'parking_fee' and created_at >= ${IST_DAY})::int as parking_revenue_today,
    (select count(*) from holds where created_at >= ${IST_DAY})::int as holds_today,
    (select count(*) from holds where status = 'expired' and created_at >= ${IST_DAY})::int as expired_today,
    (select count(*) from holds where status = 'cancelled' and created_at >= ${IST_DAY})::int as cancelled_today,
    (select count(*) from sessions where started_at >= ${IST_DAY})::int as sessions_today`);
  const byCity = await many(`select v.city, count(distinct v.id)::int as venues, count(s.id)::int as slots, count(s.id) filter (where s.status = 'free')::int as free
    from venues v join floors f on f.venue_id = v.id join slots s on s.floor_id = f.id group by v.city order by slots desc`);
  res.json({
    venues: o.venues, slots: { total: o.slots, free: o.free, occupied: o.occupied, reserved: o.reserved },
    occupancy: o.slots ? Math.round(((o.slots - o.free) / o.slots) * 100) / 100 : 0,
    activeHolds: o.active_holds, activeSessions: o.active_sessions, users: o.users,
    today: { revenue: o.revenue_today, holdRevenue: o.hold_revenue_today, parkingRevenue: o.parking_revenue_today, holds: o.holds_today, expired: o.expired_today, cancelled: o.cancelled_today, sessions: o.sessions_today },
    cities: byCity.map((c) => ({ city: c.city, venues: c.venues, slots: c.slots, free: c.free })),
    at: new Date().toISOString(),
  });
});

router.get('/venues', async (req, res) => {
  const rows = await many(`select v.id, v.name, v.city, v.type, v.rate, v.address, v.opens, v.closes, v.is24h, v.amenities, v.published,
      count(s.id)::int as total,
      count(s.id) filter (where s.status = 'free')::int as free,
      count(s.id) filter (where s.status = 'occupied')::int as occupied,
      count(s.id) filter (where s.status = 'reserved')::int as reserved,
      (select count(*) from holds h join slots s2 on s2.id = h.slot_id join floors f2 on f2.id = s2.floor_id where f2.venue_id = v.id and h.status = 'active')::int as active_holds,
      (select count(*) from sessions p join slots s3 on s3.id = p.slot_id join floors f3 on f3.id = s3.floor_id where f3.venue_id = v.id and p.ended_at is null)::int as active_sessions,
      (select coalesce(sum(p.fee - p.hold_credit), 0) from sessions p join slots s4 on s4.id = p.slot_id join floors f4 on f4.id = s4.floor_id where f4.venue_id = v.id and p.ended_at >= ${IST_DAY})::int as parking_today,
      (select coalesce(sum(h2.hold_fee), 0) from holds h2 join slots s5 on s5.id = h2.slot_id join floors f5 on f5.id = s5.floor_id where f5.venue_id = v.id and h2.created_at >= ${IST_DAY} and h2.status <> 'cancelled')::int as holds_today
    from venues v join floors f on f.venue_id = v.id join slots s on s.floor_id = f.id
    group by v.id order by v.city, v.name`);
  res.json({
    venues: rows.map((r) => ({
      id: r.id, name: r.name, city: r.city, type: r.type, rate: parseJson(r.rate, {}), address: r.address, opens: r.opens, closes: r.closes, is24h: r.is24h, amenities: parseJson(r.amenities, []), published: r.published, total: r.total, free: r.free, occupied: r.occupied, reserved: r.reserved,
      occupancy: r.total ? Math.round(((r.total - r.free) / r.total) * 100) / 100 : 0,
      activeHolds: r.active_holds, activeSessions: r.active_sessions, revenueToday: r.parking_today + r.holds_today,
    })),
  });
});

router.get('/activity', async (req, res) => {
  const holds = await many(`select h.*, s.code as slot_code, s.status as slot_status, f.id as floor_id, f.name as floor_name, v.id as venue_id, v.name as venue_name,
      v.lat as venue_lat, v.lng as venue_lng, v.address as venue_address, ve.plate as plate, u.name as user_name
    from holds h join slots s on s.id = h.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id
    left join vehicles ve on ve.id = h.vehicle_id left join users u on u.id = h.user_id order by h.created_at desc limit 60`);
  const sessions = await many(`select p.*, s.code as slot_code, f.id as floor_id, f.name as floor_name, v.id as venue_id, v.name as venue_name, v.lat as venue_lat, v.lng as venue_lng, v.rate,
      ve.plate as plate, h.hold_fee as hold_fee, u.name as user_name
    from sessions p join slots s on s.id = p.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id
    left join vehicles ve on ve.id = p.vehicle_id left join holds h on h.id = p.hold_id left join users u on u.id = p.user_id order by p.started_at desc limit 60`);
  const items = [
    ...holds.map((h) => ({ kind: 'hold', at: h.created_at, userId: h.user_id, userName: h.user_name || '', ...formatHold(h) })),
    ...sessions.map((p) => ({ kind: 'session', at: p.started_at, userId: p.user_id, userName: p.user_name || '', ...formatSession(p), status: p.ended_at ? 'ended' : 'parked' })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 80);
  res.json({ items });
});

router.get('/users', async (req, res) => {
  const rows = await many(`select u.id, u.name, u.phone, u.wallet_balance, u.created_at, u.prefs,
      coalesce(json_agg(json_build_object('plate', ve.plate, 'kind', ve.kind, 'fastag', ve.fastag_id <> '', 'isDefault', ve.is_default) order by ve.is_default desc) filter (where ve.id is not null), '[]') as vehicles,
      (select count(*) from holds h where h.user_id = u.id)::int as holds,
      (select count(*) from sessions p where p.user_id = u.id)::int as sessions,
      (select coalesce(sum(-t.amount), 0) from transactions t where t.user_id = u.id and t.amount < 0)::int as spent
    from users u left join vehicles ve on ve.user_id = u.id group by u.id order by u.created_at desc limit 200`);
  res.json({ users: rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, walletBalance: r.wallet_balance, createdAt: r.created_at, prefs: r.prefs, vehicles: r.vehicles, holds: r.holds, sessions: r.sessions, spent: r.spent })) });
});

router.get('/transactions', async (req, res) => {
  const rows = await many(`select t.*, u.name as user_name from transactions t left join users u on u.id = t.user_id order by t.created_at desc limit 150`);
  res.json({ transactions: rows.map((t) => ({ id: t.id, userId: t.user_id, userName: t.user_name || '', kind: t.kind, amount: t.amount, balanceAfter: t.balance_after, refType: t.ref_type, refId: t.ref_id, note: t.note, createdAt: t.created_at })) });
});

const AMENITIES = ['ev', 'accessible', 'covered', 'cctv', 'valet', 'restroom', '24x7', 'carwash'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

router.put('/venues/:id', async (req, res) => {
  const v = await one(`select * from venues where id = $1`, [req.params.id]);
  if (!v) throw new ApiError(404, 'VENUE_NOT_FOUND', `No venue ${req.params.id}`);
  const body = req.body || {};
  const rate = { ...parseJson(v.rate, {}) };
  for (const k of ['freeMinutes', 'firstHour', 'perHalfHour', 'dailyCap', 'holdFee']) {
    if (body.rate?.[k] === undefined) continue;
    const n = Number(body.rate[k]);
    if (!Number.isInteger(n) || n < 0 || n > 10000000) throw new ApiError(400, 'VALIDATION', `${k} must be a whole number of paise (or minutes)`);
    rate[k] = n;
  }
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 80) : v.name;
  const address = body.address !== undefined ? String(body.address).trim().slice(0, 160) : v.address;
  const opens = body.opens !== undefined ? String(body.opens) : v.opens;
  const closes = body.closes !== undefined ? String(body.closes) : v.closes;
  if (!HHMM.test(opens) || !HHMM.test(closes)) throw new ApiError(400, 'VALIDATION', 'Hours must be HH:MM');
  const is24h = body.is24h !== undefined ? !!body.is24h : v.is24h;
  const published = body.published !== undefined ? !!body.published : v.published;
  let amenities = parseJson(v.amenities, []);
  if (body.amenities !== undefined) {
    if (!Array.isArray(body.amenities)) throw new ApiError(400, 'VALIDATION', 'amenities must be a list');
    amenities = body.amenities.filter((a) => AMENITIES.includes(a));
  }
  if (!name) throw new ApiError(400, 'VALIDATION', 'Name is required');
  await run(`update venues set rate = $1, name = $2, address = $3, opens = $4, closes = $5, is24h = $6, published = $7, amenities = $8 where id = $9`,
    [JSON.stringify(rate), name, address, opens, closes, is24h, published, JSON.stringify(amenities), v.id]);
  res.json({ id: v.id, rate, name, address, opens, closes, is24h, published, amenities });
});

router.post('/floors/:id', async (req, res) => {
  const floor = await one(`select f.id, f.venue_id from floors f where f.id = $1`, [req.params.id]);
  if (!floor) throw new ApiError(404, 'FLOOR_NOT_FOUND', `No floor ${req.params.id}`);
  const body = req.body || {};
  const editable = await many(`select s.id, s.status from slots s where s.floor_id = $1 and s.status <> 'reserved'
    and not exists (select 1 from sessions p where p.slot_id = s.id and p.ended_at is null) order by s.code`, [floor.id]);
  let plan;
  if (body.status === 'free' || body.status === 'occupied') plan = editable.map((s) => [s.id, body.status]);
  else if (Number.isInteger(Number(body.occupied))) {
    const n = Math.max(0, Math.min(editable.length, Number(body.occupied)));
    const shuffled = [...editable].sort(() => Math.random() - 0.5);
    plan = shuffled.map((s, i) => [s.id, i < n ? 'occupied' : 'free']);
  } else throw new ApiError(400, 'VALIDATION', 'Pass status (free|occupied) or occupied (a count)');
  let changed = 0;
  await tx(async () => {
    for (const [id, status] of plan) {
      const before = editable.find((s) => s.id === id).status;
      if (before === status) continue;
      await setSlotStatus(id, status);
      changed++;
    }
  });
  res.json({ floorId: floor.id, changed, editable: editable.length });
});

router.post('/slots/:id', async (req, res) => {
  const status = (req.body || {}).status;
  if (!['free', 'occupied'].includes(status)) throw new ApiError(400, 'VALIDATION', 'status must be free or occupied');
  const s = await one(`select s.id, s.status, exists(select 1 from sessions p where p.slot_id = s.id and p.ended_at is null) as in_session from slots s where s.id = $1`, [req.params.id]);
  if (!s) throw new ApiError(404, 'SLOT_NOT_FOUND', `No slot ${req.params.id}`);
  if (s.status === 'reserved' || s.in_session) throw new ApiError(409, 'SLOT_BUSY', 'That slot has an active booking or parking session');
  await tx(() => setSlotStatus(s.id, status));
  res.json({ id: s.id, status });
});
