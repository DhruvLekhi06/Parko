import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ROOT = path.join(import.meta.dirname, '..');
export const PROD = process.env.NODE_ENV === 'production';
export const SYNTHETIC = process.env.SEED_SYNTHETIC ? process.env.SEED_SYNTHETIC === '1' : !PROD;
export const SIM_ON = process.env.SIM_ENABLED ? process.env.SIM_ENABLED === '1' : !PROD;

export const nowIso = () => new Date().toISOString();
export const iso = (d) => (d instanceof Date ? d.toISOString() : d ? new Date(d).toISOString() : null);
export const newId = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function gateCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `SPOT-${s}`;
}

export const parseJson = (s, fallback) => {
  if (s && typeof s === 'object') return s;
  try { return s ? JSON.parse(s) : fallback; } catch { return fallback; }
};

const istFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
export function istMinutes(date = new Date()) {
  const parts = istFmt.formatToParts(date);
  const h = Number(parts.find((p) => p.type === 'hour').value);
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}
export const istHour = (date) => istMinutes(date) / 60;

export function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const clampInt = (v, lo, hi, fallback) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

export class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
