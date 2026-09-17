const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const DEVICE_KEY = 'spoton.device';

export function deviceId() {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'd_anon';
  }
}

export const apiUrl = (path) => `${API_BASE}${path}`;

const TOKEN_KEY = 'spoton.token';
export const getToken = () => {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
export const setToken = (t) => {
  try {
    if (t) window.localStorage.setItem(TOKEN_KEY, t);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
};

function qs(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || v === false) return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class ApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code || `HTTP_${status}`;
    this.status = status;
    this.details = details || null;
  }
}

export const ADMIN_KEY = 'spoton.admin';
export const adminKey = () => {
  try {
    return window.localStorage.getItem(ADMIN_KEY) || '';
  } catch {
    return '';
  }
};

async function request(path, { method = 'GET', body, admin = false } = {}) {
  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: { 'X-User-Id': deviceId(), ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(admin ? { 'X-Admin-Key': adminKey() } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError("Can't reach SpotOn right now.", { code: 'NETWORK', status: 0 });
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (!data && res.status >= 502 && res.status <= 504) {
      throw new ApiError("Can't reach SpotOn right now.", { code: 'NETWORK', status: res.status });
    }
    throw new ApiError(data?.error?.message || `Something went wrong (${res.status}).`, {
      code: data?.error?.code,
      status: res.status,
      details: data?.error?.details,
    });
  }
  return data;
}

const pos = (p) => (p && Number.isFinite(p.lat) ? { lat: p.lat, lng: p.lng } : {});

export const api = {
  venues: (params) => request(`/api/venues${qs(params)}`),
  venue: (id, params) => request(`/api/venues/${encodeURIComponent(id)}${qs(params)}`),
  directions: (id, p) => request(`/api/venues/${encodeURIComponent(id)}/directions${qs(pos(p))}`),
  floor: (id) => request(`/api/floors/${encodeURIComponent(id)}`),
  route: (slotId) => request(`/api/route${qs({ slotId })}`),

  holdSpot: (body) => request('/api/holds', { method: 'POST', body }),
  holds: () => request('/api/holds'),
  activeHold: () => request('/api/holds/active'),
  cancelHold: (id) => request(`/api/holds/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  extendHold: (id, minutes) => request(`/api/holds/${encodeURIComponent(id)}/extend`, { method: 'POST', body: { minutes } }),
  arrive: (id) => request(`/api/holds/${encodeURIComponent(id)}/arrive`, { method: 'POST' }),

  startSession: (body) => request('/api/sessions', { method: 'POST', body }),
  activeSession: () => request('/api/sessions/active'),
  exitSession: (id) => request(`/api/sessions/${encodeURIComponent(id)}/exit`, { method: 'POST' }),
  sessions: () => request('/api/sessions'),

  auth: {
    signup: (body) => request('/api/auth/signup', { method: 'POST', body }),
    login: (body) => request('/api/auth/login', { method: 'POST', body }),
    password: (body) => request('/api/auth/password', { method: 'POST', body }),
  },
  me: () => request('/api/users/me').then((d) => d?.user ?? d),
  updateMe: (body) => request('/api/users/me', { method: 'PUT', body }).then((d) => d?.user ?? d),
  addVehicle: (body) => request('/api/vehicles', { method: 'POST', body }),
  updateVehicle: (id, body) => request(`/api/vehicles/${encodeURIComponent(id)}`, { method: 'PUT', body }).then((d) => d?.user ?? d),
  deleteVehicle: (id) => request(`/api/vehicles/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((d) => d?.user ?? d),
  wallet: () => request('/api/wallet'),
  topUp: (amount) => request('/api/wallet/topup', { method: 'POST', body: { amount } }),
  health: () => request('/api/health'),
  live: (params) => request(`/api/live${qs(params)}`),

  admin: {
    overview: () => request('/api/admin/overview', { admin: true }),
    venues: () => request('/api/admin/venues', { admin: true }),
    activity: () => request('/api/admin/activity', { admin: true }),
    users: () => request('/api/admin/users', { admin: true }),
    transactions: () => request('/api/admin/transactions', { admin: true }),
    updateRate: (id, rate) => request(`/api/admin/venues/${encodeURIComponent(id)}`, { method: 'PUT', body: { rate }, admin: true }),
    updateVenue: (id, body) => request(`/api/admin/venues/${encodeURIComponent(id)}`, { method: 'PUT', body, admin: true }),
    setFloor: (id, body) => request(`/api/admin/floors/${encodeURIComponent(id)}`, { method: 'POST', body, admin: true }),
    setSlot: (id, status) => request(`/api/admin/slots/${encodeURIComponent(id)}`, { method: 'POST', body: { status }, admin: true }),
  },
};
