import { Router } from 'express';
import { many, one, run, tx } from '../db.js';
import { newId, gateCode, clampInt, ApiError } from '../util.js';
import { setSlotStatus, expireHolds } from '../state.js';
import { getHold, activeHold, formatHold } from '../records.js';
import { credit, debit } from '../wallet.js';
import { HOLD_OPTIONS, HOLD_BLOCK_MIN, HOLD_MAX_MIN, holdPrice, refundFor } from '../fees.js';
import { currentUser, resolveVehicle, requireAccount } from './users.js';
import { bestSlotForVenue } from './floors.js';
import { startSession } from './sessions.js';

export const router = Router();


export async function cancelActiveHolds(userId, { refund } = {}) {
  const rows = await many(`select h.id, h.slot_id, h.hold_fee, h.created_at, h.expires_at, s.status as slot_status from holds h join slots s on s.id = h.slot_id where h.user_id = $1 and h.status = 'active'`, [userId]);
  for (const h of rows) {
    await run(`update holds set status = 'cancelled' where id = $1`, [h.id]);
    if (h.slot_status === 'reserved') await setSlotStatus(h.slot_id, 'free');
    const amount = refund === true ? h.hold_fee : refund === 'policy' ? refundFor(h).amount : 0;
    if (amount > 0) await credit(userId, amount, 'refund', { refType: 'hold', refId: h.id, note: 'Booking fee refunded' });
  }
  return rows;
}

router.post('/', async (req, res) => {
  const user = requireAccount(await currentUser(req));
  const body = req.body || {};
  await expireHolds();
  let slot = body.slotId ? await one(`select s.*, f.venue_id from slots s join floors f on f.id = s.floor_id where s.id = $1`, [String(body.slotId)]) : null;
  if (!slot && body.venueId) {
    const id = await bestSlotForVenue(String(body.venueId), user.prefs);
    if (!id) throw new ApiError(409, 'VENUE_FULL', 'No free spots there right now');
    slot = await one(`select s.*, f.venue_id from slots s join floors f on f.id = s.floor_id where s.id = $1`, [id]);
  }
  if (!slot) throw new ApiError(body.slotId ? 404 : 400, body.slotId ? 'SLOT_NOT_FOUND' : 'VALIDATION', body.slotId ? `No slot ${body.slotId}` : 'Pass a venueId or a slotId');
  const venue = await one(`select * from venues where id = $1`, [slot.venue_id]);
  const own = await activeHold(user.id);
  const ownSlot = own && own.slot_id === slot.id;
  if (slot.status !== 'free' && !ownSlot) throw new ApiError(409, 'SLOT_NOT_FREE', 'Someone just took that spot');
  const minutes = Number(body.minutes);
  if (!HOLD_OPTIONS.includes(minutes)) throw new ApiError(400, 'VALIDATION', `minutes must be one of ${HOLD_OPTIONS.join(', ')}`);
  const holdFee = holdPrice(venue.rate, minutes);
  const eta = clampInt(body.etaMinutes, 0, 180, 0);
  const vehicle = await resolveVehicle(user.id, body.vehicleId);
  const o = body.origin && Number.isFinite(Number(body.origin.lat)) ? { lat: Number(body.origin.lat), lng: Number(body.origin.lng) } : null;
  const id = newId('h');
  await tx(async () => {
    await cancelActiveHolds(user.id, { refund: true });
    await debit(user.id, holdFee, 'hold_fee', { refType: 'hold', refId: id, note: `Booking at ${venue.name}, ${minutes} min` });
    await run(`insert into holds (id, slot_id, user_id, vehicle_id, status, expires_at, eta_minutes, hold_fee, code, origin_lat, origin_lng)
      values ($1,$2,$3,$4,'active', now() + ($5 || ' minutes')::interval, $6, $7, $8, $9, $10)`,
      [id, slot.id, user.id, vehicle?.id || null, String(minutes), eta, holdFee, gateCode(), o?.lat ?? null, o?.lng ?? null]);
    await setSlotStatus(slot.id, 'reserved');
  });
  const hold = formatHold(await getHold(id));
  const balance = (await one(`select wallet_balance from users where id = $1`, [user.id])).wallet_balance;
  res.status(201).json({ hold, reservation: hold, walletBalance: balance });
});

router.get('/', async (req, res) => {
  const user = await currentUser(req);
  const rows = await many(`select h.*, s.code as slot_code, s.status as slot_status, f.id as floor_id, f.name as floor_name,
      v.id as venue_id, v.name as venue_name, v.lat as venue_lat, v.lng as venue_lng, v.address as venue_address, ve.plate as plate
    from holds h join slots s on s.id = h.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id
    left join vehicles ve on ve.id = h.vehicle_id where h.user_id = $1 order by h.created_at desc limit 100`, [user.id]);
  res.json({ holds: rows.map(formatHold) });
});

router.get('/active', async (req, res) => {
  await expireHolds();
  const h = await activeHold((await currentUser(req)).id);
  const hold = h ? formatHold(h) : null;
  res.json({ hold, reservation: hold });
});

router.post('/:id/extend', async (req, res) => {
  const user = requireAccount(await currentUser(req));
  const h = await getHold(req.params.id);
  if (!h || h.user_id !== user.id) throw new ApiError(404, 'HOLD_NOT_FOUND', `No hold ${req.params.id}`);
  if (h.status !== 'active') throw new ApiError(409, 'HOLD_NOT_ACTIVE', `Hold is ${h.status}`);
  const delta = Number((req.body || {}).minutes);
  if (delta !== HOLD_BLOCK_MIN && delta !== -HOLD_BLOCK_MIN) throw new ApiError(400, 'VALIDATION', `minutes must be +${HOLD_BLOCK_MIN} or -${HOLD_BLOCK_MIN}`);
  const venue = await one(`select rate, name from venues where id = $1`, [h.venue_id]);
  const block = holdPrice(venue.rate, HOLD_BLOCK_MIN);
  const created = new Date(h.created_at).getTime();
  const expires = new Date(h.expires_at).getTime();
  const next = expires + delta * 60000;
  if (delta > 0 && next - created > HOLD_MAX_MIN * 60000) throw new ApiError(409, 'HOLD_MAX', `A booking can be held for at most ${HOLD_MAX_MIN / 60} hours`);
  if (delta < 0 && next - Date.now() < 5 * 60000) throw new ApiError(409, 'HOLD_MIN', 'You cannot shorten a booking to under 5 minutes from now');
  let balance;
  await tx(async () => {
    if (delta > 0) balance = await debit(user.id, block, 'hold_fee', { refType: 'hold', refId: h.id, note: `Booking extended, ${venue.name}` });
    else balance = await credit(user.id, block, 'refund', { refType: 'hold', refId: h.id, note: `Booking shortened, ${venue.name}` });
    await run(`update holds set expires_at = $1, hold_fee = hold_fee + $2 where id = $3`, [new Date(next).toISOString(), delta > 0 ? block : -block, h.id]);
  });
  const hold = formatHold(await getHold(h.id));
  res.json({ hold, reservation: hold, walletBalance: balance });
});

router.post('/:id/arrive', async (req, res) => {
  const user = await currentUser(req);
  const session = await startSession(user, { holdId: req.params.id });
  res.status(201).json({ session });
});

router.delete('/:id', async (req, res) => {
  const user = await currentUser(req);
  const h = await getHold(req.params.id);
  if (!h || h.user_id !== user.id) throw new ApiError(404, 'HOLD_NOT_FOUND', `No hold ${req.params.id}`);
  let refunded = 0;
  let tier = 'none';
  if (h.status === 'active') {
    await tx(async () => {
      const r = refundFor(h);
      await run(`update holds set status = 'cancelled' where id = $1`, [h.id]);
      if (h.slot_status === 'reserved') await setSlotStatus(h.slot_id, 'free');
      if (r.amount > 0) await credit(user.id, r.amount, 'refund', { refType: 'hold', refId: h.id, note: r.tier === 'full' ? 'Booking fee refunded' : 'Booking fee refunded (50%)' });
      refunded = r.amount;
      tier = r.tier;
    });
  }
  const balance = (await one(`select wallet_balance from users where id = $1`, [user.id])).wallet_balance;
  res.json({ ok: true, refunded, tier, walletBalance: balance });
});
