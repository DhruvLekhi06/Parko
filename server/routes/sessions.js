import { Router } from 'express';
import { one, run, tx } from '../db.js';
import { newId, ApiError } from '../util.js';
import { setSlotStatus, expireHolds } from '../state.js';
import { exitCharge } from '../fees.js';
import { debit } from '../wallet.js';
import { getHold, activeHold, getSession, activeSession, userSessions, formatSession, elapsedMinutes } from '../records.js';
import { currentUser, resolveVehicle } from './users.js';

export const router = Router();

export async function startSession(user, { holdId, reservationId, slotId, vehicleId } = {}) {
  await expireHolds();
  if (await activeSession(user.id)) throw new ApiError(409, 'SESSION_ACTIVE', 'You already have an active parking session');
  let hold = null;
  const hid = holdId || reservationId;
  if (hid) {
    hold = await getHold(String(hid));
    if (!hold || hold.user_id !== user.id) throw new ApiError(404, 'HOLD_NOT_FOUND', `No hold ${hid}`);
    if (hold.status !== 'active') throw new ApiError(409, 'HOLD_NOT_ACTIVE', `Hold is ${hold.status}`);
  } else {
    const own = await activeHold(user.id);
    if (own && own.slot_id === slotId) hold = own;
  }
  const slot = await one(`select id, status from slots where id = $1`, [hold ? hold.slot_id : String(slotId || '')]);
  if (!slot) throw new ApiError(404, 'SLOT_NOT_FOUND', `No slot ${slotId}`);
  if (slot.status === 'occupied' || (slot.status === 'reserved' && !hold)) throw new ApiError(409, 'SLOT_NOT_FREE', `Slot is ${slot.status}`);
  const vehicle = await resolveVehicle(user.id, vehicleId || hold?.vehicle_id || undefined);
  const id = newId('p');
  await tx(async () => {
    if (hold) await run(`update holds set status = 'arrived' where id = $1`, [hold.id]);
    await run(`insert into sessions (id, slot_id, user_id, vehicle_id, hold_id) values ($1,$2,$3,$4,$5)`, [id, slot.id, user.id, vehicle?.id || null, hold?.id || null]);
    await setSlotStatus(slot.id, 'occupied');
  });
  return formatSession(await getSession(id));
}

router.post('/', async (req, res) => {
  const user = await currentUser(req);
  const session = await startSession(user, req.body || {});
  res.status(201).json({ session });
});

router.get('/active', async (req, res) => {
  const user = await currentUser(req);
  const p = await activeSession(user.id);
  if (!p) return res.json({ session: null, feeNow: 0, elapsedMinutes: 0, holdCredit: 0, dueNow: 0, walletBalance: user.walletBalance });
  const session = formatSession(p);
  const elapsed = elapsedMinutes(p.started_at);
  const charge = exitCharge(session.rate, elapsed, session.holdFee);
  res.json({ session, feeNow: charge.parkingFee, elapsedMinutes: elapsed, holdCredit: charge.holdCredit, dueNow: charge.due, walletBalance: user.walletBalance });
});

async function endSession(user, p, method) {
  const endedAt = new Date();
  const session = formatSession(p);
  const charge = exitCharge(session.rate, elapsedMinutes(p.started_at, endedAt), session.holdFee);
  let balance = user.walletBalance;
  let receiptNo = null;
  await tx(async () => {
    if (method === 'fastag') balance = await debit(user.id, charge.due, 'parking_fee', { refType: 'session', refId: p.id, note: `Parking at ${p.venue_name}` });
    const seq = (await one(`update receipt_seq set value = value + 1 where id = 1 returning value`)).value;
    receiptNo = `SP-${endedAt.getFullYear()}-${String(seq).padStart(6, '0')}`;
    await run(`update sessions set ended_at = $1, fee = $2, hold_credit = $3, paid = true, payment_method = $4, receipt_no = $5 where id = $6`,
      [endedAt.toISOString(), charge.parkingFee, charge.holdCredit, method, receiptNo, p.id]);
    await setSlotStatus(p.slot_id, 'free');
  });
  return { session: formatSession(await getSession(p.id)), receiptNo, charge, walletBalance: balance };
}

router.post('/:id/exit', async (req, res) => {
  const user = await currentUser(req);
  const p = await getSession(req.params.id);
  if (!p || p.user_id !== user.id) throw new ApiError(404, 'SESSION_NOT_FOUND', `No session ${req.params.id}`);
  if (p.ended_at) throw new ApiError(409, 'SESSION_ENDED', 'This session has already ended');
  res.json(await endSession(user, p, 'fastag'));
});

router.post('/:id/pay', async (req, res) => {
  const user = await currentUser(req);
  const method = (req.body || {}).method || 'fastag';
  if (!['upi', 'card', 'cash', 'fastag'].includes(method)) throw new ApiError(400, 'VALIDATION', 'method must be fastag, upi, card or cash');
  const p = await getSession(req.params.id);
  if (!p || p.user_id !== user.id) throw new ApiError(404, 'SESSION_NOT_FOUND', `No session ${req.params.id}`);
  if (p.ended_at) throw new ApiError(409, 'SESSION_ENDED', 'This session has already ended');
  res.json(await endSession(user, p, method));
});

router.get('/', async (req, res) => {
  res.json({ sessions: (await userSessions((await currentUser(req)).id)).map(formatSession) });
});
