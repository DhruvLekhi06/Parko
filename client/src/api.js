const BASE_HEADERS = { 'X-User-Id': 'demo' };

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
  constructor(message, { code, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code || `HTTP_${status}`;
    this.status = status;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...BASE_HEADERS, ...(body ? { 'Content-Type': 'application/json' } : {}) },
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
    });
  }
  return data;
}

export const api = {
  venues: (params) => request(`/api/venues${qs(params)}`),
  venue: (id, params) => request(`/api/venues/${encodeURIComponent(id)}${qs(params)}`),
  floor: (id) => request(`/api/floors/${encodeURIComponent(id)}`),
  route: (slotId) => request(`/api/route${qs({ slotId })}`),
  reserve: (slotId, minutes) => request('/api/reservations', { method: 'POST', body: { slotId, minutes } }),
  activeReservation: () => request('/api/reservations/active'),
  cancelReservation: (id) => request(`/api/reservations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  startSession: (body) => request('/api/sessions', { method: 'POST', body }),
  activeSession: () => request('/api/sessions/active'),
  pay: (id, method) => request(`/api/sessions/${encodeURIComponent(id)}/pay`, { method: 'POST', body: { method } }),
  sessions: () => request('/api/sessions'),
  me: () => request('/api/users/me').then((d) => d?.user ?? d),
  updateMe: (body) => request('/api/users/me', { method: 'PUT', body }).then((d) => d?.user ?? d),
  health: () => request('/api/health'),
};
