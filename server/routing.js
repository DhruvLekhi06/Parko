const BASE = (process.env.ROUTING_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
const TTL_MS = 120000;
const cache = new Map();
let disabledUntil = 0;

const coord = (p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

function remember(key, value) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 100);
    for (const [k] of oldest) cache.delete(k);
  }
  return value;
}

async function osrm(path) {
  if (Date.now() < disabledUntil) return null;
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(2500), headers: { 'User-Agent': 'SpotOn/0.2 (parking finder demo)' } });
    if (!res.ok) throw new Error(`osrm ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok') throw new Error(`osrm ${data.code}`);
    return data;
  } catch {
    disabledUntil = Date.now() + 30000;
    return null;
  }
}

export async function driveMatrix(origin, targets) {
  if (!targets.length) return new Map();
  const key = `m|${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}|${targets.map((t) => t.id).join(',')}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const coords = [origin, ...targets].map(coord).join(';');
  const data = await osrm(`/table/v1/driving/${coords}?sources=0&annotations=duration,distance`);
  const out = new Map();
  if (!data) return out;
  targets.forEach((t, i) => {
    const seconds = data.durations?.[0]?.[i + 1];
    const metres = data.distances?.[0]?.[i + 1];
    if (seconds != null && metres != null) out.set(t.id, { seconds: Math.round(seconds), metres: Math.round(metres) });
  });
  return remember(key, out);
}

export async function driveRoute(origin, dest) {
  const key = `r|${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}|${dest.lat.toFixed(4)},${dest.lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const data = await osrm(`/route/v1/driving/${coord(origin)};${coord(dest)}?overview=full&geometries=geojson&steps=false`);
  const r = data?.routes?.[0];
  if (!r) return null;
  return remember(key, {
    coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    seconds: Math.round(r.duration),
    metres: Math.round(r.distance),
    source: 'road',
  });
}

export const routingStatus = () => ({ base: BASE, healthy: Date.now() >= disabledUntil, cached: cache.size });
