import { many, one, run } from './db.js';
import { newId, ApiError } from './util.js';

export const WELCOME_CREDIT = Math.max(0, Number(process.env.WELCOME_CREDIT_PAISE) || 0);

export async function credit(userId, amount, kind, { refType = null, refId = null, note = '' } = {}) {
  const row = await one(`update users set wallet_balance = wallet_balance + $1 where id = $2 returning wallet_balance`, [amount, userId]);
  if (!row) throw new ApiError(404, 'USER_NOT_FOUND', 'No such user');
  await run(`insert into transactions (id, user_id, kind, amount, balance_after, ref_type, ref_id, note) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [newId('t'), userId, kind, amount, row.wallet_balance, refType, refId, note]);
  return row.wallet_balance;
}

export async function debit(userId, amount, kind, { refType = null, refId = null, note = '' } = {}) {
  if (amount <= 0) return (await one(`select wallet_balance from users where id = $1`, [userId]))?.wallet_balance ?? 0;
  const row = await one(`update users set wallet_balance = wallet_balance - $1 where id = $2 and wallet_balance >= $1 returning wallet_balance`, [amount, userId]);
  if (!row) {
    const cur = await one(`select wallet_balance from users where id = $1`, [userId]);
    const balance = cur?.wallet_balance ?? 0;
    throw new ApiError(402, 'INSUFFICIENT_BALANCE', 'Your FASTag wallet does not have enough balance', { balance, required: amount, shortfall: amount - balance });
  }
  await run(`insert into transactions (id, user_id, kind, amount, balance_after, ref_type, ref_id, note) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [newId('t'), userId, kind, -amount, row.wallet_balance, refType, refId, note]);
  return row.wallet_balance;
}

export const transactions = (userId, limit = 50) =>
  many(`select id, kind, amount, balance_after, ref_type, ref_id, note, created_at from transactions where user_id = $1 order by created_at desc limit $2`, [userId, limit]);
