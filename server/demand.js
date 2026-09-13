const bump = (h, centre, width) => Math.exp(-(((h - centre) / width) ** 2));
const clamp = (v) => Math.min(0.97, Math.max(0.03, v));

export function targetOccupancy(type, hour, spike = false) {
  const h = hour;
  switch (type) {
    case 'mall':
      if (h < 10 || h >= 23) return 0.06;
      return clamp(0.3 + 0.6 * bump(h, 19.5, 2.2) + 0.2 * bump(h, 13, 1.8));
    case 'hospital':
      if (h < 7 || h >= 21) return 0.3;
      return clamp(0.45 + 0.42 * bump(h, 11, 2.4));
    case 'metro':
      if (h < 6 || h >= 23) return 0.12;
      return clamp(0.38 + 0.55 * Math.max(bump(h, 9, 1.3), bump(h, 18.5, 1.8)));
    case 'rail':
      return clamp(0.62 + 0.1 * Math.sin(((h - 6) / 24) * 2 * Math.PI));
    case 'stadium':
      return spike ? 0.95 : clamp(0.22 + 0.08 * bump(h, 18, 3));
    case 'airport':
      return 0.7;
    default:
      if (h < 7 || h >= 23) return 0.18;
      return clamp(0.42 + 0.38 * Math.max(bump(h, 12.5, 2), bump(h, 19, 2)));
  }
}
