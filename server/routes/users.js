import { Router } from 'express';
import { many, one, run, tx } from '../db.js';
import { newId, ApiError } from '../util.js';
import { credit, WELCOME_CREDIT, transactions } from '../wallet.js';

const DEFAULT_PREFS = { needsEv: false, needsAccessible: false, vehicle: 'car' };
const KINDS = ['car', 'suv', 'bike'];

export const userId = (req) => (String(req.get('X-User-Id') || 'demo').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'demo');

export const normalizePlate = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
export const formatPlate = (p) => {
  const m = p.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ') : p;
};

const formatVehicle = (v) => ({ id: v.id, plate: formatPlate(v.plate), rawPlate: v.plate, label: v.label, kind: v.kind, fastagId: v.fastag_id, fastagLinked: !!v.fastag_id, isDefault: v.is_default });

export async function currentUser(req) {
  const id = userId(req);
  let row = await one(`select * from users where id = $1`, [id]);
  if (!row) {
    await tx(async () => {
      const inserted = await one(`insert into users (id, prefs) values ($1, $2) on conflict (id) do nothing returning id`, [id, JSON.stringify(DEFAULT_PREFS)]);
      if (inserted) await credit(id, WELCOME_CREDIT, 'topup', { note: 'Welcome credit' });
    });
    row = await one(`select * from users where id = $1`, [id]);
  }
  const vehicles = (await many(`select * from vehicles where user_id = $1 order by is_default desc, created_at`, [id])).map(formatVehicle);
  const defaultVehicle = vehicles.find((v) => v.isDefault) || vehicles[0] || null;
  return {
    id: row.id, name: row.name, phone: row.phone, prefs: { ...DEFAULT_PREFS, ...(row.prefs || {}) },
    walletBalance: row.wallet_balance, vehicles, defaultVehicle, plate: defaultVehicle?.plate || '',
    fastagLinked: !!defaultVehicle?.fastagLinked, createdAt: row.created_at,
  };
}

export async function resolveVehicle(userId_, vehicleId) {
  if (vehicleId) {
    const v = await one(`select * from vehicles where id = $1 and user_id = $2`, [vehicleId, userId_]);
    if (!v) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'That vehicle is not on your profile');
    return v;
  }
  return one(`select * from vehicles where user_id = $1 order by is_default desc, created_at limit 1`, [userId_]);
}

export const router = Router();

router.get('/me', async (req, res) => res.json({ user: await currentUser(req) }));

router.put('/me', async (req, res) => {
  const user = await currentUser(req);
  const body = req.body || {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.length > 60) throw new ApiError(400, 'VALIDATION', 'name must be at most 60 characters');
    user.name = body.name.trim();
  }
  if (body.phone !== undefined) {
    const digits = String(body.phone).replace(/\D/g, '').slice(-10);
    if (digits && digits.length !== 10) throw new ApiError(400, 'VALIDATION', 'phone must be a 10 digit Indian mobile number');
    user.phone = digits;
  }
  if (body.prefs !== undefined) {
    const p = body.prefs;
    if (!p || typeof p !== 'object') throw new ApiError(400, 'VALIDATION', 'prefs must be an object');
    user.prefs = {
      needsEv: p.needsEv === undefined ? user.prefs.needsEv : !!p.needsEv,
      needsAccessible: p.needsAccessible === undefined ? user.prefs.needsAccessible : !!p.needsAccessible,
      vehicle: KINDS.includes(p.vehicle) ? p.vehicle : user.prefs.vehicle,
    };
  }
  await run(`update users set name = $1, phone = $2, prefs = $3 where id = $4`, [user.name, user.phone, JSON.stringify(user.prefs), user.id]);
  if (body.plate !== undefined) {
    const plate = normalizePlate(body.plate);
    if (plate.length >= 4) {
      const existing = await resolveVehicle(user.id);
      if (existing) await run(`update vehicles set plate = $1 where id = $2`, [plate, existing.id]);
      else await run(`insert into vehicles (id, user_id, plate, kind, is_default) values ($1,$2,$3,$4,true)`, [newId('v'), user.id, plate, user.prefs.vehicle]);
    }
  }
  res.json({ user: await currentUser(req) });
});

export const vehicles = Router();

function vehicleInput(body, partial = false) {
  const out = {};
  if (!partial || body.plate !== undefined) {
    const plate = normalizePlate(body.plate);
    if (plate.length < 4) throw new ApiError(400, 'VALIDATION', 'Enter a valid number plate, like KA 01 AB 1234');
    out.plate = plate;
  }
  if (body.label !== undefined) out.label = String(body.label).trim().slice(0, 40);
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) throw new ApiError(400, 'VALIDATION', 'kind must be car, suv or bike');
    out.kind = body.kind;
  }
  if (body.fastagId !== undefined) {
    const tag = String(body.fastagId).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (tag && (tag.length < 10 || tag.length > 24)) throw new ApiError(400, 'VALIDATION', 'A FASTag ID is 10 to 24 letters and digits (it is printed on the tag)');
    out.fastag_id = tag;
  }
  if (body.isDefault !== undefined) out.is_default = !!body.isDefault;
  return out;
}

vehicles.get('/', async (req, res) => res.json({ vehicles: (await currentUser(req)).vehicles }));

vehicles.post('/', async (req, res) => {
  const user = await currentUser(req);
  const v = vehicleInput(req.body || {});
  const id = newId('v');
  await tx(async () => {
    const makeDefault = v.is_default || user.vehicles.length === 0;
    if (makeDefault) await run(`update vehicles set is_default = false where user_id = $1`, [user.id]);
    await run(`insert into vehicles (id, user_id, plate, label, kind, fastag_id, is_default) values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, user.id, v.plate, v.label || '', v.kind || user.prefs.vehicle, v.fastag_id || '', makeDefault]);
  });
  res.status(201).json({ user: await currentUser(req), vehicleId: id });
});

vehicles.put('/:id', async (req, res) => {
  const user = await currentUser(req);
  const existing = await one(`select * from vehicles where id = $1 and user_id = $2`, [req.params.id, user.id]);
  if (!existing) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'That vehicle is not on your profile');
  const v = vehicleInput(req.body || {}, true);
  await tx(async () => {
    if (v.is_default) await run(`update vehicles set is_default = false where user_id = $1`, [user.id]);
    await run(`update vehicles set plate = $1, label = $2, kind = $3, fastag_id = $4, is_default = $5 where id = $6`,
      [v.plate ?? existing.plate, v.label ?? existing.label, v.kind ?? existing.kind, v.fastag_id ?? existing.fastag_id, v.is_default ?? existing.is_default, existing.id]);
  });
  res.json({ user: await currentUser(req) });
});

vehicles.delete('/:id', async (req, res) => {
  const user = await currentUser(req);
  const inUse = await one(`select 1 from sessions where vehicle_id = $1 and ended_at is null union select 1 from holds where vehicle_id = $1 and status = 'active'`, [req.params.id]);
  if (inUse) throw new ApiError(409, 'VEHICLE_IN_USE', 'This vehicle has an active hold or parking session');
  await run(`delete from vehicles where id = $1 and user_id = $2`, [req.params.id, user.id]);
  const left = await one(`select id from vehicles where user_id = $1 order by created_at limit 1`, [user.id]);
  if (left) await run(`update vehicles set is_default = true where id = $1 and not exists (select 1 from vehicles where user_id = $2 and is_default)`, [left.id, user.id]);
  res.json({ user: await currentUser(req) });
});

export const wallet = Router();

wallet.get('/', async (req, res) => {
  const user = await currentUser(req);
  const rows = await transactions(user.id);
  res.json({
    balance: user.walletBalance,
    transactions: rows.map((t) => ({ id: t.id, kind: t.kind, amount: t.amount, balanceAfter: t.balance_after, refType: t.ref_type, refId: t.ref_id, note: t.note, createdAt: t.created_at })),
  });
});

wallet.post('/topup', async (req, res) => {
  const user = await currentUser(req);
  const amount = Number((req.body || {}).amount);
  if (!Number.isInteger(amount) || amount < 10000 || amount > 500000) throw new ApiError(400, 'VALIDATION', 'Top up between ₹100 and ₹5,000');
  const balance = await credit(user.id, amount, 'topup', { note: 'Wallet top-up' });
  res.status(201).json({ balance });
});
