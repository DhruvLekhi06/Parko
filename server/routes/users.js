import { Router } from 'express';
import { many, one, run, tx } from '../db.js';
import { newId, ApiError } from '../util.js';
import { credit, WELCOME_CREDIT, transactions } from '../wallet.js';
import { hashPassword, verifyPassword, issueToken, verifyToken, bearer, validEmail } from '../auth.js';
import { rateLimit } from '../ratelimit.js';

const DEFAULT_PREFS = { needsEv: false, needsAccessible: false, vehicle: 'car' };
const KINDS = ['car', 'suv', 'bike'];

export const deviceId = (req) => String(req.get('X-User-Id') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

export const normalizePlate = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
export const formatPlate = (p) => {
  const m = p.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  return m ? [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ') : p;
};

const formatVehicle = (v) => ({ id: v.id, plate: formatPlate(v.plate), rawPlate: v.plate, label: v.label, kind: v.kind, fastagId: v.fastag_id, issuer: v.issuer || '', fastagLinked: !!v.fastag_id, isDefault: v.is_default });

async function shape(row) {
  const vehicles = (await many(`select * from vehicles where user_id = $1 order by is_default desc, created_at`, [row.id])).map(formatVehicle);
  const defaultVehicle = vehicles.find((v) => v.isDefault) || vehicles[0] || null;
  return {
    id: row.id, name: row.name, phone: row.phone, email: row.email || '', isGuest: !row.email,
    prefs: { ...DEFAULT_PREFS, ...(row.prefs || {}) }, walletBalance: row.wallet_balance, vehicles, defaultVehicle,
    plate: defaultVehicle?.plate || '', fastagLinked: !!defaultVehicle?.fastagLinked, createdAt: row.created_at,
  };
}

async function ensureGuest(id) {
  let row = await one(`select * from users where id = $1`, [id]);
  if (row) return row;
  await tx(async () => {
    const inserted = await one(`insert into users (id, prefs) values ($1, $2) on conflict (id) do nothing returning id`, [id, JSON.stringify(DEFAULT_PREFS)]);
    if (inserted && WELCOME_CREDIT > 0) await credit(id, WELCOME_CREDIT, 'topup', { note: 'Welcome credit' });
  });
  row = await one(`select * from users where id = $1`, [id]);
  return row;
}

export async function currentUser(req) {
  const claims = verifyToken(bearer(req));
  let row = claims ? await one(`select * from users where id = $1`, [claims.uid]) : null;
  if (!row) {
    const id = deviceId(req);
    if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue');
    row = await ensureGuest(id);
    if (row.email) row = await ensureGuest(`${id}_g`);
  }
  return shape(row);
}

export function requireAccount(user) {
  if (user.isGuest) throw new ApiError(401, 'ACCOUNT_REQUIRED', 'Create an account to book and park');
  return user;
}

export async function resolveVehicle(userId_, vehicleId) {
  if (vehicleId) {
    const v = await one(`select * from vehicles where id = $1 and user_id = $2`, [vehicleId, userId_]);
    if (!v) throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'That vehicle is not on your profile');
    return v;
  }
  return one(`select * from vehicles where user_id = $1 order by is_default desc, created_at limit 1`, [userId_]);
}

function cleanName(name) {
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 60) throw new ApiError(400, 'VALIDATION', 'Enter your name (2 to 60 characters)');
  return name.trim();
}
function cleanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '').slice(-10);
  if (digits && digits.length !== 10) throw new ApiError(400, 'VALIDATION', 'Enter a 10 digit Indian mobile number');
  return digits;
}
function cleanPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) throw new ApiError(400, 'VALIDATION', 'Use a password of at least 8 characters');
  return pw;
}

export const auth = Router();
auth.use(rateLimit({ windowMs: 60000, max: 12, key: 'auth' }));

auth.post('/signup', async (req, res) => {
  const body = req.body || {};
  const name = cleanName(body.name);
  const email = String(body.email || '').trim().toLowerCase();
  if (!validEmail(email)) throw new ApiError(400, 'VALIDATION', 'Enter a valid email address');
  const password = cleanPassword(body.password);
  const phone = cleanPhone(body.phone);
  if (await one(`select 1 from users where lower(email) = $1`, [email])) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Log in instead.');
  const passwordHash = await hashPassword(password);
  const guestId = deviceId(req);
  const id = newId('u');
  await tx(async () => {
    const guest = guestId ? await one(`select * from users where id = $1 and email is null`, [guestId]) : null;
    await run(`insert into users (id, name, email, password_hash, phone, prefs, wallet_balance, last_login_at) values ($1,$2,$3,$4,$5,$6,$7, now())`,
      [id, name, email, passwordHash, phone || guest?.phone || '', JSON.stringify(guest?.prefs || DEFAULT_PREFS), guest?.wallet_balance || 0]);
    if (guest) {
      for (const t of ['vehicles', 'holds', 'sessions', 'transactions']) await run(`update ${t} set user_id = $1 where user_id = $2`, [id, guest.id]);
      await run(`update users set wallet_balance = 0, name = '', phone = '' where id = $1`, [guest.id]);
    }
    if (WELCOME_CREDIT > 0) await credit(id, WELCOME_CREDIT, 'topup', { note: 'Welcome credit' });
  });
  const user = await shape(await one(`select * from users where id = $1`, [id]));
  res.status(201).json({ token: issueToken(id), user });
});

auth.post('/login', async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const row = validEmail(email) ? await one(`select * from users where lower(email) = $1`, [email]) : null;
  const ok = row && (await verifyPassword(String(body.password || ''), row.password_hash));
  if (!ok) throw new ApiError(401, 'BAD_CREDENTIALS', 'Email or password is wrong');
  await run(`update users set last_login_at = now() where id = $1`, [row.id]);
  res.json({ token: issueToken(row.id), user: await shape(row) });
});

auth.post('/password', async (req, res) => {
  const user = requireAccount(await currentUser(req));
  const body = req.body || {};
  const row = await one(`select password_hash from users where id = $1`, [user.id]);
  if (!(await verifyPassword(String(body.current || ''), row.password_hash))) throw new ApiError(401, 'BAD_CREDENTIALS', 'Current password is wrong');
  await run(`update users set password_hash = $1 where id = $2`, [await hashPassword(cleanPassword(body.next)), user.id]);
  res.json({ ok: true });
});

auth.get('/me', async (req, res) => res.json({ user: await currentUser(req) }));

export const router = Router();

router.get('/me', async (req, res) => res.json({ user: await currentUser(req) }));

router.put('/me', async (req, res) => {
  const user = await currentUser(req);
  const body = req.body || {};
  const name = body.name !== undefined ? cleanName(body.name) : user.name;
  const phone = body.phone !== undefined ? cleanPhone(body.phone) : user.phone;
  let prefs = user.prefs;
  if (body.prefs !== undefined) {
    const p = body.prefs;
    if (!p || typeof p !== 'object') throw new ApiError(400, 'VALIDATION', 'prefs must be an object');
    prefs = {
      needsEv: p.needsEv === undefined ? user.prefs.needsEv : !!p.needsEv,
      needsAccessible: p.needsAccessible === undefined ? user.prefs.needsAccessible : !!p.needsAccessible,
      vehicle: KINDS.includes(p.vehicle) ? p.vehicle : user.prefs.vehicle,
    };
  }
  await run(`update users set name = $1, phone = $2, prefs = $3 where id = $4`, [name, phone, JSON.stringify(prefs), user.id]);
  if (body.plate !== undefined) {
    const plate = normalizePlate(body.plate);
    if (plate.length >= 4) {
      const existing = await resolveVehicle(user.id);
      if (existing) await run(`update vehicles set plate = $1 where id = $2`, [plate, existing.id]);
      else await run(`insert into vehicles (id, user_id, plate, kind, is_default) values ($1,$2,$3,$4,true)`, [newId('v'), user.id, plate, prefs.vehicle]);
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
  if (body.issuer !== undefined) out.issuer = String(body.issuer).trim().slice(0, 60);
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
    await run(`insert into vehicles (id, user_id, plate, label, kind, fastag_id, issuer, is_default) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, user.id, v.plate, v.label || '', v.kind || user.prefs.vehicle, v.fastag_id || '', v.issuer || '', makeDefault]);
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
    await run(`update vehicles set plate = $1, label = $2, kind = $3, fastag_id = $4, issuer = $5, is_default = $6 where id = $7`,
      [v.plate ?? existing.plate, v.label ?? existing.label, v.kind ?? existing.kind, v.fastag_id ?? existing.fastag_id, v.issuer ?? existing.issuer, v.is_default ?? existing.is_default, existing.id]);
  });
  res.json({ user: await currentUser(req) });
});

vehicles.delete('/:id', async (req, res) => {
  const user = await currentUser(req);
  const inUse = await one(`select 1 from sessions where vehicle_id = $1 and ended_at is null union select 1 from holds where vehicle_id = $1 and status = 'active'`, [req.params.id]);
  if (inUse) throw new ApiError(409, 'VEHICLE_IN_USE', 'This vehicle has an active booking or parking session');
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
  const user = requireAccount(await currentUser(req));
  const amount = Number((req.body || {}).amount);
  if (!Number.isInteger(amount) || amount < 10000 || amount > 500000) throw new ApiError(400, 'VALIDATION', 'Top up between ₹100 and ₹5,000');
  const balance = await credit(user.id, amount, 'topup', { note: 'Wallet top-up' });
  res.status(201).json({ balance });
});
