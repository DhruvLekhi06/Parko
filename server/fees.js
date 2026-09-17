export const STANDARD_RATE = { freeMinutes: 0, firstHour: 5000, perHalfHour: 3000, dailyCap: 60000, holdFee: 2000 };

export function computeFee(rate, elapsedMinutes) {
  const r = { ...STANDARD_RATE, ...(rate || {}) };
  const elapsed = Math.max(0, Math.ceil(elapsedMinutes));
  if (elapsed <= (r.freeMinutes || 0)) return 0;
  let fee = 0;
  let remaining = elapsed;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 1440);
    const chunkFee = r.firstHour + Math.ceil(Math.max(0, chunk - 60) / 30) * r.perHalfHour;
    fee += r.dailyCap ? Math.min(chunkFee, r.dailyCap) : chunkFee;
    remaining -= chunk;
  }
  return fee;
}

export function exitCharge(rate, elapsedMinutes, holdFee = 0) {
  const parkingFee = computeFee(rate, elapsedMinutes);
  const holdCredit = Math.min(holdFee, parkingFee);
  return { parkingFee, holdCredit, due: parkingFee - holdCredit };
}

export const HOLD_REFUND_WINDOW_MIN = 5;

export const HOLD_BLOCK_MIN = 15;
export const HOLD_OPTIONS = [15, 30, 60];
export const HOLD_MAX_MIN = 240;
export const HOLD_PARTIAL_PCT = 50;
export const HOLD_NO_REFUND_LAST_MIN = 10;

export const holdPrice = (rate, minutes) => Math.max(1, Math.round(minutes / HOLD_BLOCK_MIN)) * (rate?.holdFee ?? 2000);

export function refundFor(hold, now = Date.now()) {
  const created = new Date(hold.created_at || hold.createdAt).getTime();
  const expires = new Date(hold.expires_at || hold.expiresAt).getTime();
  const fee = hold.hold_fee ?? hold.holdFee ?? 0;
  if (now - created <= HOLD_REFUND_WINDOW_MIN * 60000) return { amount: fee, tier: 'full' };
  if (expires - now <= HOLD_NO_REFUND_LAST_MIN * 60000) return { amount: 0, tier: 'none' };
  return { amount: Math.round((fee * HOLD_PARTIAL_PCT) / 100), tier: 'partial' };
}

