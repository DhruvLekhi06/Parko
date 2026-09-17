import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHmac } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
export const PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.SESSION_SECRET || 'dev-session-secret-change-me';

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, saltB, keyB] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !saltB || !keyB) return false;
  const key = await scrypt(password, Buffer.from(saltB, 'base64url'), 64);
  const expected = Buffer.from(keyB, 'base64url');
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const sign = (s) => createHmac('sha256', SECRET).update(s).digest('base64url');

export function issueToken(userId, days = 30) {
  const payload = encode({ uid: userId, iat: Date.now(), exp: Date.now() + days * 86400000 });
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!claims.uid || !claims.exp || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export const bearer = (req) => {
  const h = req.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
};

export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
