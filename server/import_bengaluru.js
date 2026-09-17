import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { query, one, many, tx, migrate, close } from './db.js';
import { generateFloor } from './layout.js';
import { haversineM, hashStr, mulberry32, SYNTHETIC } from './util.js';
import { synthHistory, insertHistory } from './history.js';
import { RATES, HOURS, IMAGES, LEVELS, insertRows } from './seed.js';

const CITY = 'Bengaluru';
const BBOX = '12.72,77.35,13.30,77.90';
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const QUERY = `[out:json][timeout:120];
(
  nwr["shop"="mall"]["name"](${BBOX});
  nwr["amenity"="hospital"]["name"](${BBOX});
  nwr["railway"="station"]["name"](${BBOX});
  nwr["amenity"="parking"]["name"]["parking"~"multi-storey|underground|rooftop"](${BBOX});
  nwr["leisure"="stadium"]["name"](${BBOX});
  nwr["tourism"~"^(attraction|theme_park|zoo|museum)$"]["name"](${BBOX});
  nwr["amenity"~"^(cinema|exhibition_centre|conference_centre|bus_station)$"]["name"](${BBOX});
  nwr["aeroway"="aerodrome"]["name"](${BBOX});
);
out center tags;`;

const LOCALITIES = [
  ['Koramangala', 12.9352, 77.6245], ['Indiranagar', 12.9784, 77.6408], ['Whitefield', 12.9698, 77.75], ['HSR Layout', 12.9116, 77.6389], ['Jayanagar', 12.93, 77.5833],
  ['JP Nagar', 12.9063, 77.5857], ['Malleshwaram', 13.0031, 77.5643], ['Rajajinagar', 12.9915, 77.5554], ['Yelahanka', 13.1007, 77.5963], ['Hebbal', 13.0358, 77.597],
  ['Marathahalli', 12.9569, 77.7011], ['Bellandur', 12.9257, 77.6649], ['Sarjapur Road', 12.9081, 77.6866], ['Electronic City', 12.8452, 77.6602], ['Bannerghatta Road', 12.8935, 77.5975],
  ['MG Road', 12.9752, 77.6068], ['Brigade Road', 12.9716, 77.6077], ['Shivajinagar', 12.9857, 77.6057], ['Majestic', 12.9767, 77.5713], ['Basavanagudi', 12.9422, 77.5745],
  ['Banashankari', 12.9255, 77.5468], ['BTM Layout', 12.9166, 77.6101], ['Domlur', 12.9609, 77.6387], ['Ulsoor', 12.9816, 77.6217], ['Frazer Town', 12.9977, 77.6156],
  ['RT Nagar', 13.0209, 77.5947], ['Sadashivanagar', 13.0069, 77.5806], ['Vijayanagar', 12.9719, 77.5341], ['Kengeri', 12.9083, 77.4823], ['Nagarbhavi', 12.9605, 77.5122],
  ['Peenya', 13.0291, 77.5192], ['Yeshwanthpur', 13.0236, 77.5511], ['Hennur', 13.0347, 77.6393], ['Kalyan Nagar', 13.0227, 77.6408], ['Kammanahalli', 13.0128, 77.6353],
  ['Thanisandra', 13.0574, 77.6255], ['Nagawara', 13.0426, 77.6187], ['KR Puram', 13.0035, 77.6866], ['Mahadevapura', 12.9917, 77.6858], ['Brookefield', 12.9671, 77.7191],
  ['Kadugodi', 12.9946, 77.7581], ['Hoodi', 12.9915, 77.7157], ['Devanahalli', 13.2437, 77.7104], ['Doddaballapur', 13.2928, 77.5373], ['Attibele', 12.7789, 77.7714],
  ['Hosur Road', 12.9, 77.62], ['Silk Board', 12.9174, 77.6229], ['Bommanahalli', 12.9027, 77.6234], ['Uttarahalli', 12.9059, 77.5443], ['Rajarajeshwari Nagar', 12.9284, 77.5192],
  ['Kanakapura Road', 12.8916, 77.5511], ['Hulimavu', 12.8776, 77.6016], ['Begur', 12.8776, 77.6276], ['Chandapura', 12.8017, 77.7012], ['Anekal', 12.7105, 77.6958],
  ['Varthur', 12.9411, 77.7442], ['Kundalahalli', 12.9762, 77.7147], ['Ramamurthy Nagar', 13.0125, 77.6774], ['Horamavu', 13.0284, 77.6612], ['Banaswadi', 13.0142, 77.6519],
  ['Jalahalli', 13.0459, 77.5468], ['Mathikere', 13.0335, 77.5591], ['Sanjaynagar', 13.0366, 77.5749], ['Vidyaranyapura', 13.0797, 77.5578], ['Jakkur', 13.0787, 77.6068],
  ['Cubbon Park', 12.9763, 77.5929], ['Vasanth Nagar', 12.9916, 77.5896], ['Richmond Town', 12.9613, 77.6006], ['Wilson Garden', 12.9498, 77.5968], ['Lalbagh', 12.9507, 77.5848],
  ['Shanti Nagar', 12.958, 77.5987], ['Ashok Nagar', 12.9703, 77.6089], ['Church Street', 12.9749, 77.6081], ['Commercial Street', 12.9822, 77.6086], ['Cunningham Road', 12.9885, 77.5951],
  ['Seshadripuram', 12.9903, 77.5749], ['Chickpet', 12.9683, 77.5762], ['KR Market', 12.9634, 77.5744], ['Chamrajpet', 12.9563, 77.5637], ['Girinagar', 12.9432, 77.5346],
  ['Padmanabhanagar', 12.9153, 77.5563], ['Gottigere', 12.8563, 77.5906], ['Kothanur', 13.0621, 77.6473], ['Bidadi', 12.7956, 77.3852], ['Nelamangala', 13.0991, 77.3935],
  ['Hesaraghatta', 13.1391, 77.4805], ['Bagalur', 13.1327, 77.6713], ['Airport Road', 13.1986, 77.7066], ['Sahakara Nagar', 13.0623, 77.5818], ['Hebbal Kempapura', 13.045, 77.6],
];

const TYPE_SPECS = {
  mall: { floors: ['B1,G', 'B2,B1', 'B2,B1,G'], per: [80, 140], amenities: 'ev,accessible,covered,cctv,restroom' },
  hospital: { floors: ['G', 'B1,G'], per: [50, 90], amenities: 'accessible,covered,cctv,24x7,restroom' },
  metro: { floors: ['G'], per: [40, 60], amenities: 'cctv,accessible' },
  rail: { floors: ['G', 'G,L1'], per: [60, 100], amenities: 'cctv,24x7,accessible' },
  stadium: { floors: ['G'], per: [80, 120], amenities: 'cctv,accessible,restroom' },
  airport: { floors: ['L1,L2'], per: [120, 160], amenities: 'ev,accessible,covered,cctv,24x7,restroom' },
  public: { floors: ['G', 'B1,G'], per: [40, 80], amenities: 'cctv,accessible' },
};

function classify(t) {
  if (t.shop === 'mall') return 'mall';
  if (t.amenity === 'hospital') return 'hospital';
  if (t.railway === 'station') return t.station === 'subway' || /metro/i.test(t.network || '') || /metro/i.test(t.name || '') ? 'metro' : 'rail';
  if (t.leisure === 'stadium') return 'stadium';
  if (t.aeroway === 'aerodrome') return 'airport';
  return 'public';
}

function locality(lat, lng, tags) {
  let best = null;
  for (const [name, la, ln] of LOCALITIES) {
    const d = haversineM(lat, lng, la, ln);
    if (!best || d < best.d) best = { name, d };
  }
  if (tags['addr:suburb']) return tags['addr:suburb'];
  return best && best.d < 4500 ? best.name : CITY;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slug = (s) => norm(s).replace(/\s+/g, '_').slice(0, 40);

export async function importBengaluru({ log = console.log } = {}) {
  let data;
  if (process.env.OVERPASS_FILE) {
    log(`reading ${process.env.OVERPASS_FILE}`);
    data = JSON.parse(await readFile(process.env.OVERPASS_FILE, 'utf8'));
  } else {
    log('fetching Bengaluru places from OpenStreetMap');
    const res = await fetch(OVERPASS, {
      method: 'POST',
      body: `data=${encodeURIComponent(QUERY)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'SpotOn/0.2 (parking finder; contact: hello@spoton.app)' },
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) throw new Error(`overpass ${res.status}: ${(await res.text()).slice(0, 200)}`);
    data = await res.json();
  }
  const elements = data.elements || [];
  log(`${elements.length} elements`);
  const existing = await many(`select id, name, lat, lng from venues`);
  const taken = existing.map((v) => ({ ...v, n: norm(v.name) }));
  const candidates = [];
  for (const el of elements) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!t.name || lat == null || lng == null) continue;
    if (/^[^a-z]*$/i.test(t.name)) continue;
    const n = norm(t.name);
    if (n.length < 3) continue;
    const dupe = taken.find((v) => haversineM(lat, lng, v.lat, v.lng) < (v.n === n ? 1500 : 120)) || candidates.find((c) => haversineM(lat, lng, c.lat, c.lng) < (c.n === n ? 1500 : 60));
    if (dupe) continue;
    candidates.push({ osm: `${el.type[0]}${el.id}`, name: t.name.slice(0, 80), n, type: classify(t), lat, lng, tags: t });
  }
  log(`${candidates.length} new places after dedupe`);
  const counts = { venues: 0, floors: 0, slots: 0 };
  const now = new Date();
  for (const c of candidates) {
    const id = `v_osm_${c.osm}`;
    const rng = mulberry32(hashStr(id));
    const spec = TYPE_SPECS[c.type];
    const floorNames = spec.floors[Math.floor(rng() * spec.floors.length)].split(',');
    const perFloor = Math.round((spec.per[0] + rng() * (spec.per[1] - spec.per[0])) / 10) * 10;
    const [opens, closes, is24h] = HOURS[c.type];
    const address = [c.tags['addr:street'], locality(c.lat, c.lng, c.tags)].filter(Boolean).join(', ');
    const total = perFloor * floorNames.length;
    const history = SYNTHETIC ? synthHistory(id, c.type, total, now) : [];
    let freeLeft = SYNTHETIC ? history[history.length - 1].free : total;
    let slotsLeft = total;
    await tx(async () => {
      const ins = await one(`insert into venues (id, name, type, city, address, lat, lng, opens, closes, is24h, amenities, rate, image, floors)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (id) do nothing returning id`,
        [id, c.name, c.type, CITY, address, c.lat, c.lng, opens, closes, is24h, JSON.stringify(spec.amenities.split(',')), JSON.stringify(RATES[c.type]), JSON.stringify(IMAGES[c.type]), floorNames.length]);
      if (!ins) return;
      counts.venues++;
      for (const floorName of floorNames) {
        const floorId = `f_osm_${c.osm}_${floorName.toLowerCase()}`;
        const { layout, slots } = generateFloor({ venueKey: `osm_${c.osm}`, floorName, level: LEVELS[floorName], target: perFloor });
        await query(`insert into floors (id, venue_id, name, level, width, height, layout) values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`,
          [floorId, id, floorName, LEVELS[floorName], layout.width, layout.height, JSON.stringify({ entrances: layout.entrances, lifts: layout.lifts, lanes: layout.lanes, pillars: layout.pillars, zones: layout.zones })]);
        counts.floors++;
        const rows = slots.map((s) => {
          const free = rng() < freeLeft / slotsLeft;
          if (free) freeLeft--;
          slotsLeft--;
          return [s.id, floorId, s.code, s.x, s.y, s.w, s.h, s.type, free ? 'free' : 'occupied', s.distToEntrance, now.toISOString()];
        });
        await insertRows('slots', ['id', 'floor_id', 'code', 'x', 'y', 'w', 'h', 'type', 'status', 'dist_to_entrance', 'updated_at'], rows);
        counts.slots += rows.length;
      }
      if (history.length) await insertHistory(id, history);
    });
  }
  log(`imported ${counts.venues} venues, ${counts.floors} floors, ${counts.slots} slots`);
  return counts;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate();
  await importBengaluru();
  await close();
}
