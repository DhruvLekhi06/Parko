import { Router } from 'express';
import { get, run, tx } from '../db.js';
import { nowIso, newId, ApiError } from '../util.js';
import { setSlotStatus, expireReservations } from '../state.js';
import { computeFee } from '../fees.js';
import { getReservation, activeReservation, getSession, activeSession, userSessions, formatSession, elapsedMinutes } from '../records.js';
import { currentUser } from './users.js';

export const router = Router();

router.post('/', (req, res) => {
  const user = currentUser(req);
  const { reservationId, slotId } = req.body || {};
  expireReservations();
  if (activeSession(user.id)) throw new ApiError(409, 'SESSION_ACTIVE', 'You already have an active parking session');
  let reservation = null;
  if (reservationId) {
    reservation = getReservation(String(reservationId));
    if (!reservation || reservation.user_id !== user.id) throw new ApiError(404, 'RESERVATION_NOT_FOUND', `No reservation ${reservationId}`);
    if (reservation.status !== 'active') throw new ApiError(409, 'RESERVATION_NOT_ACTIVE', `Reservation is ${reservation.status}`);
  } else {
    const own = activeReservation(user.id);
    if (own && own.slot_id === slotId) reservation = own;
  }
  const slot = get(`select id, status from slots where id = ?`, reservation ? reservation.slot_id : String(slotId || ''));
  if (!slot) throw new ApiError(404, 'SLOT_NOT_FOUND', `No slot ${slotId}`);
  if (slot.status === 'occupied' || (slot.status === 'reserved' && !reservation)) throw new ApiError(409, 'SLOT_NOT_FREE', `Slot is ${slot.status}`);
  const id = newId('p');
  tx(() => {
    if (reservation) run(`update reservations set status = 'converted' where id = ?`, reservation.id);
    run(`insert into sessions (id, slot_id, user_id, started_at) values (?,?,?,?)`, id, slot.id, user.id, nowIso());
    setSlotStatus(slot.id, 'occupied');
  });
  res.status(201).json({ session: formatSession(getSession(id)) });
});

router.get('/active', (req, res) => {
  const p = activeSession(currentUser(req).id);
  if (!p) return res.json({ session: null, feeNow: 0, elapsedMinutes: 0 });
  const session = formatSession(p);
  const elapsed = elapsedMinutes(p.started_at);
  res.json({ session, feeNow: computeFee(session.rate, elapsed), elapsedMinutes: elapsed });
});

router.post('/:id/pay', (req, res) => {
  const user = currentUser(req);
  const method = (req.body || {}).method;
  if (!['upi', 'card', 'cash'].includes(method)) throw new ApiError(400, 'VALIDATION', 'method must be upi, card or cash');
  const p = getSession(req.params.id);
  if (!p || p.user_id !== user.id) throw new ApiError(404, 'SESSION_NOT_FOUND', `No session ${req.params.id}`);
  if (p.ended_at) throw new ApiError(409, 'SESSION_ENDED', 'Session is already paid');
  const endedAt = nowIso();
  const fee = computeFee(formatSession(p).rate, elapsedMinutes(p.started_at, endedAt));
  const seq = get(`select count(*) as c from sessions where receipt_no is not null`).c + 1;
  const receiptNo = `SP-${endedAt.slice(0, 4)}-${String(seq).padStart(6, '0')}`;
  tx(() => {
    run(`update sessions set ended_at = ?, fee = ?, paid = 1, payment_method = ?, receipt_no = ? where id = ?`, endedAt, fee, method, receiptNo, p.id);
    setSlotStatus(p.slot_id, 'free');
  });
  res.json({ session: formatSession(getSession(p.id)), receiptNo });
});

router.get('/', (req, res) => {
  res.json({ sessions: userSessions(currentUser(req).id).map(formatSession) });
});
