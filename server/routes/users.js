import { Router } from 'express';
import { get, run } from '../db.js';
import { parseJson, ApiError } from '../util.js';

const DEFAULT_PREFS = { needsEv: false, needsAccessible: false, vehicle: 'car' };

export const userId = (req) => String(req.get('X-User-Id') || 'demo').slice(0, 40);

export function currentUser(req) {
  const id = userId(req);
  let row = get(`select * from users where id = ?`, id);
  if (!row) {
    run(`insert into users (id, name, plate, prefs) values (?, '', '', ?)`, id, JSON.stringify(DEFAULT_PREFS));
    row = get(`select * from users where id = ?`, id);
  }
  return { id: row.id, name: row.name, plate: row.plate, prefs: { ...DEFAULT_PREFS, ...parseJson(row.prefs, {}) } };
}

export const router = Router();

router.get('/me', (req, res) => res.json({ user: currentUser(req) }));

router.put('/me', (req, res) => {
  const user = currentUser(req);
  const body = req.body || {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length > 60) throw new ApiError(400, 'VALIDATION', 'name must be a string of at most 60 characters');
    user.name = body.name.trim();
  }
  if (body.plate !== undefined) {
    if (typeof body.plate !== 'string' || body.plate.length > 20) throw new ApiError(400, 'VALIDATION', 'plate must be a string of at most 20 characters');
    user.plate = body.plate.trim().toUpperCase();
  }
  if (body.prefs !== undefined) {
    const p = body.prefs;
    if (!p || typeof p !== 'object') throw new ApiError(400, 'VALIDATION', 'prefs must be an object');
    if (p.vehicle !== undefined && !['car', 'bike'].includes(p.vehicle)) throw new ApiError(400, 'VALIDATION', 'vehicle must be car or bike');
    user.prefs = {
      needsEv: p.needsEv === undefined ? user.prefs.needsEv : !!p.needsEv,
      needsAccessible: p.needsAccessible === undefined ? user.prefs.needsAccessible : !!p.needsAccessible,
      vehicle: p.vehicle || user.prefs.vehicle,
    };
  }
  run(`update users set name = ?, plate = ?, prefs = ? where id = ?`, user.name, user.plate, JSON.stringify(user.prefs), user.id);
  res.json({ user });
});
