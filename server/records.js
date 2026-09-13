import { all, get } from './db.js';
import { parseJson } from './util.js';

const RES_SQL = `select r.id, r.slot_id, r.user_id, r.status, r.created_at, r.expires_at, r.code,
  s.code as slot_code, s.status as slot_status, f.id as floor_id, f.name as floor_name, v.id as venue_id, v.name as venue_name
  from reservations r join slots s on s.id = r.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id`;

const SES_SQL = `select p.id, p.slot_id, p.user_id, p.started_at, p.ended_at, p.fee, p.paid, p.payment_method, p.receipt_no,
  s.code as slot_code, f.id as floor_id, f.name as floor_name, v.id as venue_id, v.name as venue_name, v.rate
  from sessions p join slots s on s.id = p.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id`;

export const getReservation = (id) => get(`${RES_SQL} where r.id = ?`, id);
export const activeReservation = (userId) => get(`${RES_SQL} where r.user_id = ? and r.status = 'active' order by r.created_at desc limit 1`, userId);
export const getSession = (id) => get(`${SES_SQL} where p.id = ?`, id);
export const activeSession = (userId) => get(`${SES_SQL} where p.user_id = ? and p.ended_at is null order by p.started_at desc limit 1`, userId);
export const userSessions = (userId) => all(`${SES_SQL} where p.user_id = ? order by p.started_at desc`, userId);

export function formatReservation(r) {
  return {
    id: r.id, slotId: r.slot_id, slotCode: r.slot_code, floorId: r.floor_id, floorName: r.floor_name,
    venueId: r.venue_id, venueName: r.venue_name, status: r.status, createdAt: r.created_at, expiresAt: r.expires_at, code: r.code,
  };
}

export const elapsedMinutes = (startedAt, endedAt) => Math.max(0, Math.floor((new Date(endedAt || Date.now()) - new Date(startedAt)) / 60000));

export function formatSession(p) {
  return {
    id: p.id, slotId: p.slot_id, slotCode: p.slot_code, floorId: p.floor_id, floorName: p.floor_name,
    venueId: p.venue_id, venueName: p.venue_name, startedAt: p.started_at, endedAt: p.ended_at, fee: p.fee, paid: !!p.paid,
    paymentMethod: p.payment_method, receiptNo: p.receipt_no, rate: parseJson(p.rate, {}), durationMinutes: elapsedMinutes(p.started_at, p.ended_at),
  };
}
