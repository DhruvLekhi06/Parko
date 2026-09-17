import { many, one } from './db.js';
import { iso, parseJson } from './util.js';
import { HOLD_REFUND_WINDOW_MIN, HOLD_PARTIAL_PCT, HOLD_NO_REFUND_LAST_MIN, HOLD_MAX_MIN, refundFor } from './fees.js';

const HOLD_SQL = `select h.*, s.code as slot_code, s.status as slot_status, f.id as floor_id, f.name as floor_name,
  v.id as venue_id, v.name as venue_name, v.lat as venue_lat, v.lng as venue_lng, v.address as venue_address, ve.plate as plate
  from holds h join slots s on s.id = h.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id
  left join vehicles ve on ve.id = h.vehicle_id`;

const SES_SQL = `select p.*, s.code as slot_code, f.id as floor_id, f.name as floor_name, v.id as venue_id, v.name as venue_name,
  v.lat as venue_lat, v.lng as venue_lng, v.rate, ve.plate as plate, h.hold_fee as hold_fee
  from sessions p join slots s on s.id = p.slot_id join floors f on f.id = s.floor_id join venues v on v.id = f.venue_id
  left join vehicles ve on ve.id = p.vehicle_id left join holds h on h.id = p.hold_id`;

export const getHold = (id) => one(`${HOLD_SQL} where h.id = $1`, [id]);
export const activeHold = (userId) => one(`${HOLD_SQL} where h.user_id = $1 and h.status = 'active' order by h.created_at desc limit 1`, [userId]);
export const getSession = (id) => one(`${SES_SQL} where p.id = $1`, [id]);
export const activeSession = (userId) => one(`${SES_SQL} where p.user_id = $1 and p.ended_at is null order by p.started_at desc limit 1`, [userId]);
export const userSessions = (userId) => many(`${SES_SQL} where p.user_id = $1 order by p.started_at desc limit 100`, [userId]);

export function formatHold(h) {
  const createdAt = new Date(h.created_at);
  return {
    id: h.id, slotId: h.slot_id, slotCode: h.slot_code, floorId: h.floor_id, floorName: h.floor_name,
    venueId: h.venue_id, venueName: h.venue_name, venueLat: h.venue_lat, venueLng: h.venue_lng, venueAddress: h.venue_address,
    vehicleId: h.vehicle_id, plate: h.plate || '', status: h.status, createdAt: iso(createdAt), expiresAt: iso(h.expires_at),
    etaMinutes: h.eta_minutes, holdFee: h.hold_fee, code: h.code,
    minutes: Math.round((new Date(h.expires_at).getTime() - createdAt.getTime()) / 60000),
    refundableUntil: iso(new Date(createdAt.getTime() + HOLD_REFUND_WINDOW_MIN * 60000)),
    refund: refundFor(h),
    policy: { fullMinutes: HOLD_REFUND_WINDOW_MIN, partialPct: HOLD_PARTIAL_PCT, noRefundLastMinutes: HOLD_NO_REFUND_LAST_MIN, maxMinutes: HOLD_MAX_MIN },
    origin: h.origin_lat != null ? { lat: h.origin_lat, lng: h.origin_lng } : null,
  };
}

export const elapsedMinutes = (startedAt, endedAt) => Math.max(0, Math.floor((new Date(endedAt || Date.now()) - new Date(startedAt)) / 60000));

export function formatSession(p) {
  return {
    id: p.id, slotId: p.slot_id, slotCode: p.slot_code, floorId: p.floor_id, floorName: p.floor_name,
    venueId: p.venue_id, venueName: p.venue_name, venueLat: p.venue_lat, venueLng: p.venue_lng,
    vehicleId: p.vehicle_id, plate: p.plate || '', holdId: p.hold_id, holdFee: p.hold_fee ?? 0,
    startedAt: iso(p.started_at), endedAt: iso(p.ended_at), fee: p.fee, holdCredit: p.hold_credit, paid: !!p.paid,
    paymentMethod: p.payment_method, receiptNo: p.receipt_no, rate: parseJson(p.rate, {}), durationMinutes: elapsedMinutes(p.started_at, p.ended_at),
  };
}
