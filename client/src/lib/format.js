export function rupees(paise) {
  const n = Number(paise) || 0;
  const whole = Math.floor(n / 100);
  const rem = n % 100;
  if (rem === 0) return `₹${whole.toLocaleString('en-IN')}`;
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function distance(m) {
  if (m == null) return '';
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function minutes(min) {
  if (min == null) return '';
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function clock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${((h + 11) % 12) + 1}:${m} ${suffix}`;
}

export function dateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function to12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = ((h + 11) % 12) + 1;
  return m ? `${hour}:${String(m).padStart(2, '0')} ${suffix}` : `${hour} ${suffix}`;
}

export function hoursLabel(v) {
  if (!v) return '';
  if (v.is24h) return 'Open 24 hours';
  if (v.isOpen) return `Open until ${to12h(v.closes)}`;
  return `Closed, opens ${to12h(v.opens)}`;
}

export const LEVELS = {
  open: { label: 'Plenty of room', tone: 'green' },
  filling: { label: 'Filling up', tone: 'amber' },
  almost_full: { label: 'Filling up fast', tone: 'red' },
  full: { label: 'Full right now', tone: 'red' },
};

export function levelInfo(level) {
  return LEVELS[level] || LEVELS.open;
}

export const TYPE_LABELS = {
  mall: 'Mall',
  hospital: 'Hospital',
  metro: 'Metro',
  rail: 'Railway',
  stadium: 'Stadium',
  airport: 'Airport',
  public: 'Public',
};

export const AMENITY_LABELS = {
  ev: 'EV charging',
  accessible: 'Accessible',
  covered: 'Covered',
  cctv: 'CCTV',
  valet: 'Valet',
  restroom: 'Restroom',
  '24x7': 'Open 24x7',
  carwash: 'Car wash',
};

export function formatPlate(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let i = 0;
  const take = (re, max) => {
    let g = '';
    while (i < s.length && g.length < max && re.test(s[i])) g += s[i++];
    return g;
  };
  const a = take(/[A-Z]/, 2);
  const b = take(/[0-9]/, 2);
  const c = take(/[A-Z]/, 3);
  const d = take(/[0-9]/, 4);
  return [a, b, c, d].filter(Boolean).join(' ');
}

export function feeFor(elapsedMinutes, rate) {
  if (!rate) return 0;
  const e = Math.max(0, elapsedMinutes);
  if (e <= (rate.freeMinutes || 0)) return 0;
  const extra = Math.ceil(Math.max(0, e - 60) / 60);
  const fee = (rate.firstHour || 0) + extra * (rate.perAdditionalHour || 0);
  return rate.dailyCap ? Math.min(fee, rate.dailyCap) : fee;
}

export function walkMeters(distToEntrance) {
  return Math.round((distToEntrance || 0) * 2.5);
}

export function walkTime(meters) {
  const s = Math.round(meters / 1.3);
  if (s < 45) return 'under a minute';
  return `${Math.max(1, Math.round(s / 60))} min walk`;
}

export function reverseSteps(steps = []) {
  return [...steps].reverse().map((s) =>
    s
      .replace(/^Enter via/i, 'Exit via')
      .replace(/^Slot (\S+) is on your (left|right)/i, 'Start at slot $1')
      .replace(/Turn left/gi, '__SWAP__')
      .replace(/Turn right/gi, 'Turn left')
      .replace(/__SWAP__/g, 'Turn right')
  );
}

export function maskTag(id) {
  const s = String(id || '');
  return s.length > 4 ? `•••• ${s.slice(-4)}` : s;
}

export const VEHICLE_KINDS = { car: 'Car', suv: 'SUV', bike: 'Bike' };

export const TXN_LABELS = {
  topup: 'Top-up',
  hold_fee: 'Hold fee',
  parking_fee: 'Parking',
  refund: 'Refund',
};

export function holdWindow(hold) {
  if (!hold?.expiresAt) return '';
  return `Held until ${clock(hold.expiresAt)}`;
}
