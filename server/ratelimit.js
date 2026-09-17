import { ApiError } from './util.js';

export function rateLimit({ windowMs = 60000, max = 60, key = 'global' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length) hits.set(k, kept);
      else hits.delete(k);
    }
  }, windowMs).unref();
  return (req, res, next) => {
    const id = `${key}:${req.ip}`;
    const now = Date.now();
    const arr = (hits.get(id) || []).filter((t) => t > now - windowMs);
    if (arr.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many requests, slow down a little');
    }
    arr.push(now);
    hits.set(id, arr);
    next();
  };
}
