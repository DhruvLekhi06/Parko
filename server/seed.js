import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DB_PATH, nowIso, istHour, mulberry32, hashStr } from './util.js';
import { generateFloor } from './layout.js';
import { targetOccupancy } from './demand.js';

const RATES = {
  mall: { freeMinutes: 15, firstHour: 4000, perAdditionalHour: 3000, dailyCap: 30000 },
  hospital: { freeMinutes: 30, firstHour: 3000, perAdditionalHour: 2000, dailyCap: 20000 },
  metro: { freeMinutes: 10, firstHour: 2000, perAdditionalHour: 1000, dailyCap: 10000 },
  rail: { freeMinutes: 10, firstHour: 2000, perAdditionalHour: 1000, dailyCap: 10000 },
  stadium: { freeMinutes: 10, firstHour: 5000, perAdditionalHour: 5000, dailyCap: 50000 },
  airport: { freeMinutes: 7, firstHour: 12000, perAdditionalHour: 8000, dailyCap: 80000 },
  public: { freeMinutes: 10, firstHour: 2000, perAdditionalHour: 2000, dailyCap: 15000 },
};
const HOURS = {
  mall: ['10:00', '23:00', 0], hospital: ['00:00', '23:59', 1], metro: ['05:00', '23:30', 0], rail: ['00:00', '23:59', 1],
  stadium: ['06:00', '22:00', 0], airport: ['00:00', '23:59', 1], public: ['07:00', '23:00', 0],
};
const IMAGES = {
  mall: { emoji: '🛍️', color: '#0BB57A' }, hospital: { emoji: '🏥', color: '#E5484D' }, metro: { emoji: '🚇', color: '#1C7ED6' },
  rail: { emoji: '🚆', color: '#7048E8' }, stadium: { emoji: '🏟️', color: '#F5A524' }, airport: { emoji: '✈️', color: '#0B1220' },
  public: { emoji: '🅿️', color: '#5B6B7F' },
};
const LEVELS = { B3: -3, B2: -2, B1: -1, G: 0, L1: 1, L2: 2, L3: 3 };

const VENUES = [
  ['v_orion', 'Orion Mall', 'mall', 'Brigade Gateway, Rajajinagar', 13.011, 77.5551, 'B2,B1,G', 120, 'ev,accessible,covered,cctv,valet,restroom'],
  ['v_nexus_kora', 'Nexus Mall Koramangala', 'mall', '80 Feet Rd, Koramangala', 12.9346, 77.6113, 'B2,B1', 140, 'ev,accessible,covered,cctv,restroom,carwash'],
  ['v_phoenix_wf', 'Phoenix Marketcity', 'mall', 'Whitefield Main Rd, Mahadevapura', 12.9976, 77.6963, 'B2,B1,L1', 150, 'ev,accessible,covered,cctv,valet,restroom,carwash'],
  ['v_phoenix_moa', 'Phoenix Mall of Asia', 'mall', 'Bellary Rd, Yelahanka', 13.0637, 77.594, 'B3,B2,B1', 160, 'ev,accessible,covered,cctv,valet,restroom'],
  ['v_ubcity', 'UB City', 'mall', 'Vittal Mallya Rd, Ashok Nagar', 12.9719, 77.5962, 'B2,B1', 90, 'ev,accessible,covered,cctv,valet'],
  ['v_garuda', 'Garuda Mall', 'mall', 'Magrath Rd, Ashok Nagar', 12.9707, 77.6094, 'B1,G', 100, 'accessible,covered,cctv,restroom'],
  ['v_mantri', 'Mantri Square', 'mall', 'Sampige Rd, Malleshwaram', 12.9915, 77.5703, 'B2,B1', 130, 'ev,accessible,covered,cctv,restroom'],
  ['v_lulu', 'Lulu Mall Bengaluru', 'mall', 'Gopalapura, Rajajinagar', 12.9925, 77.5498, 'B2,B1,G', 140, 'ev,accessible,covered,cctv,valet,restroom,carwash'],
  ['v_vega', 'Vega City Mall', 'mall', 'Bannerghatta Rd, Bilekahalli', 12.9089, 77.602, 'B1,G', 100, 'ev,accessible,covered,cctv'],
  ['v_gopalan', 'Gopalan Innovation Mall', 'mall', 'Bannerghatta Rd, JP Nagar', 12.9089, 77.594, 'B1,G', 80, 'accessible,covered,cctv'],
  ['v_manipal', 'Manipal Hospital', 'hospital', 'Old Airport Rd, Kodihalli', 12.9592, 77.6493, 'B1,G', 90, 'accessible,covered,cctv,24x7,restroom,ev'],
  ['v_apollo', 'Apollo Hospital', 'hospital', 'Bannerghatta Rd, IIM-B', 12.8916, 77.5974, 'B1,G', 80, 'accessible,covered,cctv,24x7,restroom'],
  ['v_fortis', 'Fortis Hospital', 'hospital', 'Bannerghatta Rd, Bilekahalli', 12.8946, 77.5977, 'G', 70, 'accessible,cctv,24x7,restroom'],
  ['v_mgroad', 'MG Road Metro (Park & Ride)', 'metro', 'MG Rd, Shivaji Nagar', 12.9756, 77.6068, 'G', 60, 'cctv,accessible,ev'],
  ['v_indiranagar', 'Indiranagar Metro (Park & Ride)', 'metro', 'CMH Rd, Indiranagar', 12.9784, 77.6386, 'G', 50, 'cctv,accessible'],
  ['v_whitefield_m', 'Whitefield (Kadugodi) Metro', 'metro', 'Kadugodi, Whitefield', 12.9955, 77.7587, 'G,L1', 80, 'cctv,accessible,ev,covered'],
  ['v_ksr', 'KSR Bengaluru City Railway Station', 'rail', 'Gubbi Thotadappa Rd, Majestic', 12.9776, 77.5713, 'G,L1', 110, 'cctv,24x7,accessible,restroom'],
  ['v_ypr', 'Yeshwanthpur Railway Station', 'rail', 'Tumkur Rd, Yeshwanthpur', 13.0236, 77.5511, 'G', 80, 'cctv,24x7,accessible'],
  ['v_chinnaswamy', 'M. Chinnaswamy Stadium', 'stadium', 'Queens Rd, Cubbon Park', 12.9788, 77.5996, 'G,L1', 120, 'cctv,accessible,restroom'],
  ['v_kanteerava', 'Sree Kanteerava Stadium', 'stadium', 'Kasturba Rd, Sampangi Rama Nagar', 12.9694, 77.5928, 'G', 100, 'cctv,accessible'],
  ['v_kia', 'Kempegowda Intl Airport, P1 Multi-level', 'airport', 'KIAL Rd, Devanahalli', 13.1989, 77.7068, 'L1,L2,L3', 160, 'ev,accessible,covered,cctv,24x7,restroom,valet'],
  ['v_lalbagh', 'Lalbagh West Gate Parking', 'public', 'Lalbagh West Gate, Basavanagudi', 12.9507, 77.5848, 'G', 60, 'cctv'],
  ['v_church', 'Church Street MLCP', 'public', 'Church St, Shanthala Nagar', 12.9737, 77.6083, 'B1,G,L1', 70, 'cctv,accessible,covered'],
  ['v_jayanagar', 'Jayanagar 4th Block Complex', 'public', '4th Block, Jayanagar', 12.928, 77.5836, 'G', 60, 'cctv,accessible'],
];

export function seed(db, { log = console.log } = {}) {
  const { run, tx } = db;
  const now = new Date();
  const counts = { venues: 0, floors: 0, slots: 0 };
  tx(() => {
    run(`insert or ignore into users (id, name, plate, prefs) values (?, ?, ?, ?)`, 'demo', 'Demo Driver', 'KA 01 AB 1234',
      JSON.stringify({ needsEv: false, needsAccessible: false, vehicle: 'car' }));
    for (const [id, name, type, address, lat, lng, floorSpec, perFloor, amenities] of VENUES) {
      const key = id.slice(2);
      const floorNames = floorSpec.split(',');
      const [opens, closes, is24h] = HOURS[type];
      run(`insert into venues (id, name, type, address, lat, lng, opens, closes, is24h, amenities, rate, image, floors) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, name, type, address, lat, lng, opens, closes, is24h, JSON.stringify(amenities.split(',')), JSON.stringify(RATES[type]), JSON.stringify(IMAGES[type]), floorNames.length);
      counts.venues++;
      const history = synthHistory(id, type, perFloor * floorNames.length, now);
      const wantFree = history[history.length - 1].free;
      const total = perFloor * floorNames.length;
      const rng = mulberry32(hashStr(id));
      let freeLeft = wantFree;
      let slotsLeft = total;
      for (const floorName of floorNames) {
        const floorId = `f_${key}_${floorName.toLowerCase()}`;
        const { layout, slots } = generateFloor({ venueKey: key, floorName, level: LEVELS[floorName], target: perFloor });
        run(`insert into floors (id, venue_id, name, level, width, height, layout) values (?,?,?,?,?,?,?)`,
          floorId, id, floorName, LEVELS[floorName], layout.width, layout.height,
          JSON.stringify({ entrances: layout.entrances, lifts: layout.lifts, lanes: layout.lanes, pillars: layout.pillars, zones: layout.zones }));
        counts.floors++;
        for (const s of slots) {
          const free = rng() < freeLeft / slotsLeft;
          if (free) freeLeft--;
          slotsLeft--;
          run(`insert into slots (id, floor_id, code, x, y, w, h, type, status, dist_to_entrance, updated_at) values (?,?,?,?,?,?,?,?,?,?,?)`,
            s.id, floorId, s.code, s.x, s.y, s.w, s.h, s.type, free ? 'free' : 'occupied', s.distToEntrance, now.toISOString());
          counts.slots++;
        }
      }
      for (const h of history) run(`insert or replace into availability_history (venue_id, ts, free) values (?,?,?)`, id, h.ts, h.free);
    }
  });
  log(`seeded ${counts.venues} venues, ${counts.floors} floors, ${counts.slots} slots`);
  return counts;
}

function synthHistory(venueId, type, total, now) {
  const rng = mulberry32(hashStr(`${venueId}:history`));
  const start = Math.floor(now.getTime() / 60000) * 60000 - 24 * 60 * 60000;
  const out = [];
  let noise = 0;
  for (let i = 0; i <= 24 * 60; i++) {
    const t = new Date(start + i * 60000);
    noise = Math.max(-0.06, Math.min(0.06, noise + (rng() - 0.5) * 0.01));
    const occ = Math.min(0.99, Math.max(0.01, targetOccupancy(type, istHour(t)) + noise));
    out.push({ ts: t.toISOString(), free: Math.round(total * (1 - occ)) });
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) for (const suffix of ['', '-wal', '-shm']) rmSync(DB_PATH + suffix, { force: true });
  const db = await import('./db.js');
  if (db.isSeeded()) { console.log('database already seeded, use --reset to rebuild'); process.exit(0); }
  seed(db);
}
