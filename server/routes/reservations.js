import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { nowIso, newId, gateCode, ApiError } from '../util.js';
import { setSlotStatus, expireReservations } from '../state.js';
import { getReservation, activeReservation, formatReservation } from '../records.js';
import { currentUser } from './users.js';

export const router = Router();

export function cancelActiveReservations(userId, status = 'cancelled') {
  const rows = all(`select r.id, r.slot_id, s.status as slot_status from reservations r join slots s on s.id = r.slot_id where r.user_id = ? and r.status = 'active'`, userId);
  for (const r of rows) {
    run(`update reservations set status = ? where id = ?`, status, r.id);
    if (r.slot_status === 'reserved') setSlotStatus(r.slot_id, 'free');
  }
}

router.post('/', (req, res) => {
  const user = currentUser(req);
  const { slotId, minutes } = req.body || {};
  if (![15, 30, 60].includes(minutes)) throw new ApiError(400, 'VALIDATION', 'minutes must be 15, 30 or 60');
  expireReservations();
  const slot = get(`select id, status from slots where id = ?`, String(slotId || ''));
  if (!slot) throw new ApiError(404, 'SLOT_NOT_FOUND', `No slot ${slotId}`);
  const own = activeReservation(user.id);
  const ownSlot = own && own.slot_id === slot.id;
  if (slot.status !== 'free' && !(slot.status === 'reserved' && ownSlot)) throw new ApiError(409, 'SLOT_NOT_FREE', `Slot is ${slot.status}`);
  const id = newId('r');
  tx(() => {
    cancelActiveReservations(user.id);
    const created = new Date();
    run(`insert into reservations (id, slot_id, user_id, status, created_at, expires_at, code) values (?,?,?,?,?,?,?)`,
      id, slot.id, user.id, 'active', created.toISOString(), new Date(created.getTime() + minutes * 60000).toISOString(), gateCode());
    setSlotStatus(slot.id, 'reserved');
  });
  res.status(201).json({ reservation: formatReservation(getReservation(id)) });
});

router.get('/active', (req, res) => {
  expireReservations();
  const r = activeReservation(currentUser(req).id);
  res.json({ reservation: r ? formatReservation(r) : null });
});

router.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const r = getReservation(req.params.id);
  if (!r || r.user_id !== user.id) throw new ApiError(404, 'RESERVATION_NOT_FOUND', `No reservation ${req.params.id}`);
  if (r.status === 'active') {
    tx(() => {
      run(`update reservations set status = 'cancelled' where id = ?`, r.id);
      if (r.slot_status === 'reserved') setSlotStatus(r.slot_id, 'free');
    });
  }
  res.json({ ok: true });
});
