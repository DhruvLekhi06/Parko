import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR, DB_PATH } from './util.js';

mkdirSync(DATA_DIR, { recursive: true });
export const db = new DatabaseSync(DB_PATH);
db.exec('pragma journal_mode = wal; pragma synchronous = normal; pragma foreign_keys = on;');

db.exec(`
create table if not exists users (
  id text primary key, name text not null default '', plate text not null default '', prefs text not null default '{}');
create table if not exists venues (
  id text primary key, name text not null, type text not null, address text not null,
  lat real not null, lng real not null, opens text not null, closes text not null, is24h integer not null default 0,
  amenities text not null, rate text not null, image text not null, floors integer not null);
create table if not exists floors (
  id text primary key, venue_id text not null references venues(id), name text not null, level integer not null,
  width integer not null, height integer not null, layout text not null);
create table if not exists slots (
  id text primary key, floor_id text not null references floors(id), code text not null,
  x integer not null, y integer not null, w integer not null, h integer not null,
  type text not null, status text not null, dist_to_entrance integer not null, updated_at text not null);
create index if not exists idx_slots_floor_status on slots(floor_id, status);
create table if not exists reservations (
  id text primary key, slot_id text not null references slots(id), user_id text not null references users(id),
  status text not null, created_at text not null, expires_at text not null, code text not null);
create index if not exists idx_reservations_user on reservations(user_id, status);
create table if not exists sessions (
  id text primary key, slot_id text not null references slots(id), user_id text not null references users(id),
  started_at text not null, ended_at text, fee integer not null default 0, paid integer not null default 0,
  payment_method text, receipt_no text);
create index if not exists idx_sessions_user on sessions(user_id, ended_at);
create table if not exists availability_history (
  venue_id text not null references venues(id), ts text not null, free integer not null, primary key (venue_id, ts));
`);

const stmts = new Map();
const stmt = (sql) => {
  let s = stmts.get(sql);
  if (!s) { s = db.prepare(sql); stmts.set(sql, s); }
  return s;
};
export const all = (sql, ...p) => stmt(sql).all(...p);
export const get = (sql, ...p) => stmt(sql).get(...p);
export const run = (sql, ...p) => stmt(sql).run(...p);
export function tx(fn) {
  db.exec('begin');
  try { const r = fn(); db.exec('commit'); return r; } catch (e) { db.exec('rollback'); throw e; }
}
export const isSeeded = () => get('select count(*) as c from venues').c > 0;
