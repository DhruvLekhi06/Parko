import { Router } from 'express';
import { many, one, run, tx } from '../db.js';
import { newId, gateCode, clampInt, ApiError } from '../util.js';
import { setSlotStatus, expireHolds } from '../state.js';
import { getHold, activeHold, formatHold } from '../records.js';
import { credit, debit } from '../wallet.js';
import { HOLD_REFUND_WINDOW_MIN } from '../fees.js';
import { currentUser, resolveVehicle, requireAccount } from './users.js';
import { bestSlotForVenue } from './floors.js';
import { startSession } from './sessions.js';

export const router = Router();

const GRACE_MIN = 15;
const MAX_HOLD_MIN = 240;

export async function cancelActiveHolds(userId, { refund } = {}) {
  const rows = await many(`select h.id, h.slot_id, h.hold_fee, h.created_at, s.status as slot_status from holds h join slots s on s.id = h.slot_id where h.user_id = $1 and h.status = 'active'`, [userId]);
  for (const h of rows) {
    await run(`update holds set status = 'cancelled' where id = $1`, [h.id]);
    if (h.slot_status === 'reserved') await setSlotStatus(h.slot_id, 'free');
    const withinWindow = Date.now() - new Date(h.created_at).getTime() <= HOLD_REFUND_WINDOW_MIN * 60000;
    if (h.hold_fee > 0 && (refund === true || (refund === 'window' && withinWindow))) {
      await credit(userId, h.hold_fee, 'refund', { refType: 'hold', refId: h.id, note: 'Booking fee refunded' });
    }
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
  const eta = clampInt(body.etaMinutes ?? body.minutes, 0, 180, 30);
  const holdMinutes = Math.min(MAX_HOLD_MIN, Math.max(15, eta + GRACE_MIN));
  const holdFee = venue.rate?.holdFee ?? 2000;
  const vehicle = await resolveVehicle(user.id, body.vehicleId);
  const o = body.origin && Number.isFinite(Number(body.origin.lat)) ? { lat: Number(body.origin.lat), lng: Number(body.origin.lng) } : null;
  let id = own?.id;
  await tx(async () => {
    if (ownSlot) {
      await run(`update holds set expires_at = now() + ($1 || ' minutes')::interval, eta_minutes = $2 where id = $3`, [String(holdMinutes), eta, own.id]);
      return;
    }
    await cancelActiveHolds(user.id, { refund: true });
    id = newId('h');
    await debit(user.id, holdFee, 'hold_fee', { refType: 'hold', refId: id, note: `Booking at ${venue.name}` });
    await run(`insert into holds (id, slot_id, user_id, vehicle_id, status, expires_at, eta_minutes, hold_fee, code, origin_lat, origin_lng)
      values ($1,$2,$3,$4,'active', now() + ($5 || ' minutes')::interval, $6, $7, $8, $9, $10)`,
      [id, slot.id, user.id, vehicle?.id || null, String(holdMinutes), eta, holdFee, gateCode(), o?.lat ?? null, o?.lng ?? null]);
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
  const user = await currentUser(req);
  const h = await getHold(req.params.id);
  if (!h || h.user_id !== user.id) throw new ApiError(404, 'HOLD_NOT_FOUND', `No hold ${req.params.id}`);
  if (h.status !== 'active') throw new ApiError(409, 'HOLD_NOT_ACTIVE', `Hold is ${h.status}`);
  const extra = clampInt((req.body || {}).minutes, 5, 60, 15);
  const maxExpiry = new Date(new Date(h.created_at).getTime() + MAX_HOLD_MIN * 60000);
  const next = new Date(Math.min(maxExpiry.getTime(), new Date(h.expires_at).getTime() + extra * 60000));
  await run(`update holds set expires_at = $1 where id = $2`, [next.toISOString(), h.id]);
  const hold = formatHold(await getHold(h.id));
  res.json({ hold, reservation: hold });
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
  if (h.status === 'active') {
    await tx(async () => {
      const withinWindow = Date.now() - new Date(h.created_at).getTime() <= HOLD_REFUND_WINDOW_MIN * 60000;
      await run(`update holds set status = 'cancelled' where id = $1`, [h.id]);
      if (h.slot_status === 'reserved') await setSlotStatus(h.slot_id, 'free');
      if (withinWindow && h.hold_fee > 0) {
        await credit(user.id, h.hold_fee, 'refund', { refType: 'hold', refId: h.id, note: 'Booking fee refunded' });
        refunded = h.hold_fee;
      }
    });
  }
  const balance = (await one(`select wallet_balance from users where id = $1`, [user.id])).wallet_balance;
  res.json({ ok: true, refunded, walletBalance: balance });
});
