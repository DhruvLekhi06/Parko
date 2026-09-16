export function computeFee(rate, elapsedMinutes) {
  const elapsed = Math.max(0, Math.floor(elapsedMinutes));
  if (elapsed <= rate.freeMinutes) return 0;
  let fee = 0;
  let remaining = elapsed;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 1440);
    const chunkFee = rate.firstHour + Math.ceil(Math.max(0, chunk - 60) / 60) * rate.perAdditionalHour;
    fee += Math.min(chunkFee, rate.dailyCap);
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
