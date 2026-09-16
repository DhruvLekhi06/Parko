import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

const url = process.env.DATABASE_URL || 'postgres://parko:parko_local_dev@localhost:5432/parko';
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 8 });
const current = new AsyncLocalStorage();

const conn = () => current.getStore() || pool;
export const query = (sql, params = []) => conn().query(sql, params);
export const many = async (sql, params = []) => (await conn().query(sql, params)).rows;
export const one = async (sql, params = []) => (await conn().query(sql, params)).rows[0] ?? null;
export const run = query;

export async function tx(fn) {
  if (current.getStore()) return fn();
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await current.run(client, fn);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

export async function migrate() {
  await query(`
create table if not exists users (
  id text primary key,
  name text not null default '',
  phone text not null default '',
  prefs jsonb not null default '{}'::jsonb,
  wallet_balance integer not null default 0,
  created_at timestamptz not null default now());
create table if not exists vehicles (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  plate text not null,
  label text not null default '',
  kind text not null default 'car',
  fastag_id text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default now());
create index if not exists idx_vehicles_user on vehicles(user_id);
create table if not exists venues (
  id text primary key, name text not null, type text not null, city text not null default 'Bengaluru', address text not null,
  lat double precision not null, lng double precision not null, opens text not null, closes text not null, is24h boolean not null default false,
  amenities jsonb not null, rate jsonb not null, image jsonb not null, floors integer not null);
create table if not exists floors (
  id text primary key, venue_id text not null references venues(id) on delete cascade, name text not null, level integer not null,
  width integer not null, height integer not null, layout jsonb not null);
create table if not exists slots (
  id text primary key, floor_id text not null references floors(id) on delete cascade, code text not null,
  x integer not null, y integer not null, w integer not null, h integer not null,
  type text not null, status text not null, dist_to_entrance integer not null, updated_at timestamptz not null default now());
create index if not exists idx_slots_floor_status on slots(floor_id, status);
create table if not exists holds (
  id text primary key, slot_id text not null references slots(id) on delete cascade, user_id text not null references users(id),
  vehicle_id text, status text not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
  eta_minutes integer not null default 0, hold_fee integer not null default 0, code text not null,
  origin_lat double precision, origin_lng double precision);
create index if not exists idx_holds_user on holds(user_id, status);
create index if not exists idx_holds_expiry on holds(status, expires_at);
create table if not exists sessions (
  id text primary key, slot_id text not null references slots(id) on delete cascade, user_id text not null references users(id),
  vehicle_id text, hold_id text, started_at timestamptz not null default now(), ended_at timestamptz,
  fee integer not null default 0, hold_credit integer not null default 0, paid boolean not null default false,
  payment_method text, receipt_no text);
create index if not exists idx_sessions_user on sessions(user_id, ended_at);
create table if not exists transactions (
  id text primary key, user_id text not null references users(id), kind text not null, amount integer not null,
  balance_after integer not null, ref_type text, ref_id text, note text not null default '', created_at timestamptz not null default now());
create index if not exists idx_transactions_user on transactions(user_id, created_at desc);
create table if not exists availability_history (
  venue_id text not null references venues(id) on delete cascade, ts timestamptz not null, free integer not null, primary key (venue_id, ts));
create table if not exists receipt_seq (id integer primary key, value integer not null);
insert into receipt_seq (id, value) values (1, 0) on conflict do nothing;
`);
}

export const isSeeded = async () => (await one(`select count(*)::int as c from venues`)).c > 0;
export const close = () => pool.end();
