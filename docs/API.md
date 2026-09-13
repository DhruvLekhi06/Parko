# SpotOn API contract (server <-> client)

Server: Express 5 on http://localhost:3001. Client dev server (Vite, :5173) proxies `/api` to it.
All responses JSON. Money is in **paise** (integer). Timestamps are ISO 8601 strings (UTC). Coordinates are WGS84.
Single demo user, id `demo` (no auth). Client sends `X-User-Id: demo` on every request (server defaults to `demo` if absent).

## Data model (SQLite via `node:sqlite`, file `server/data/parko.db`)

- `users` (id, name, plate, prefs JSON: `{ needsEv: bool, needsAccessible: bool, vehicle: "car"|"bike" }`)
- `venues` (id, name, type, address, lat, lng, opens, closes, is24h, amenities JSON, rate JSON, image (color/emoji token), floors count)
  - `type` in: `mall | hospital | metro | rail | stadium | airport | public`
  - `amenities` list from: `ev, accessible, covered, cctv, valet, restroom, 24x7, carwash`
  - `rate`: `{ freeMinutes, firstHour, perAdditionalHour, dailyCap }` in paise
- `floors` (id, venue_id, name e.g. "B2", level int e.g. -2, width, height, layout JSON: entrances, lifts, lanes, pillars, zones)
- `slots` (id, floor_id, code e.g. "B1-042", x, y, w, h, type `standard|ev|accessible`, status `free|occupied|reserved`, dist_to_entrance (grid units), updated_at)
- `reservations` (id, slot_id, user_id, status `active|cancelled|expired|converted`, created_at, expires_at)
- `sessions` (id, slot_id, user_id, started_at, ended_at, fee, paid, payment_method)
- `availability_history` (venue_id, ts, free) sampled every 60 s, keep last 24 h, seeded with a synthetic last-24h curve

## Floor layout format (server generates, client renders as SVG)

Grid units: 1 unit = 2.5 m. Origin top-left. `x,y` are the top-left corner of the object.

```json
{
  "id": "f_orion_b1", "venueId": "v_orion", "name": "B1", "level": -1,
  "width": 48, "height": 28,
  "entrances": [{ "id": "E1", "label": "Gate 1 (Main)", "x": 0, "y": 13, "w": 1, "h": 2 }],
  "lifts": [{ "id": "L1", "label": "Lift A", "x": 22, "y": 0, "w": 2, "h": 2 }],
  "lanes": [{ "x": 1, "y": 12, "w": 46, "h": 3 }],
  "pillars": [{ "x": 10, "y": 10 }],
  "zones": [{ "label": "A", "x": 1, "y": 1, "w": 20, "h": 10 }],
  "slots": [
    { "id": "s_orion_b1_042", "code": "B1-042", "x": 5, "y": 9, "w": 1, "h": 2, "type": "standard", "status": "free", "distToEntrance": 14 }
  ]
}
```

Rules: slots are 1x2 (cars) placed in rows that touch a lane; lanes form a connected graph reaching every slot row and every entrance/lift; `distToEntrance` is BFS grid distance from the nearest entrance along lanes.

## Endpoints

### `GET /api/venues?lat=&lng=&type=&ev=1&accessible=1&q=`
Returns venues sorted by distance. `lat/lng` optional (default 12.9716, 77.5946).
```json
{ "venues": [{
  "id": "v_orion", "name": "Orion Mall", "type": "mall", "address": "Brigade Gateway, Rajajinagar",
  "lat": 13.0110, "lng": 77.5551, "distanceM": 4200, "etaMin": 14,
  "opens": "10:00", "closes": "23:00", "is24h": false, "isOpen": true,
  "amenities": ["ev","accessible","covered","cctv"],
  "rate": { "freeMinutes": 15, "firstHour": 4000, "perAdditionalHour": 3000, "dailyCap": 30000 },
  "total": 320, "free": 61, "freeEv": 3, "freeAccessible": 2,
  "occupancy": 0.81, "level": "filling",
  "trend": "rising",
  "floors": [{ "id": "f_orion_b1", "name": "B1", "free": 30, "total": 160 }]
}]}
```
`level` = `open` (<60% full) | `filling` (60-90%) | `almost_full` (90-99%) | `full`. `trend` = `rising|falling|steady` from last 30 min. `etaMin` = distanceM / 400 (25 km/h avg city speed), min 1.

### `GET /api/venues/:id`
Same object as above plus `history: [{ "ts": "...", "free": 61 }]` (last 24 h, 1 point per 10 min) and `floors[]` with `freeEv`, `freeAccessible`.

### `GET /api/floors/:id`
The floor layout object above, with live slot statuses. Also includes `venue: { id, name }` and `recommendedSlotId` (nearest free slot to an entrance that matches the user's prefs: ev pref -> ev slot if any, accessible pref -> accessible slot; else standard; falls back to any free).

### `GET /api/route?slotId=`
Path from the nearest entrance to the slot along lanes.
```json
{ "floorId": "f_orion_b1", "entranceId": "E1",
  "points": [{ "x": 0.5, "y": 14 }, { "x": 5.5, "y": 14 }, { "x": 5.5, "y": 11 }],
  "steps": ["Enter via Gate 1 (Main)", "Go straight for 30 m", "Turn left at pillar row C", "Slot B1-042 is on your right"],
  "distanceM": 85, "walkSeconds": 70, "driveSeconds": 25 }
```
`points` are cell centres. Steps are derived from direction changes; lengths rounded to 5 m.

### `GET /api/events` (Server-Sent Events)
`Content-Type: text/event-stream`. Events:
- `event: slot` `data: { "slotId", "floorId", "venueId", "status" }`
- `event: venue` `data: { "venueId", "free", "freeEv", "freeAccessible", "level", "trend" }` (sent whenever any of its slots change, coalesced to max 1 per venue per 2 s)
- `event: reservation` `data: { "id", "status" }` when a reservation expires
- `: ping` comment every 20 s.

### `POST /api/reservations` body `{ "slotId", "minutes": 15|30|60 }`
Reserves a free slot for the user. 409 if not free. Cancels any other active reservation of the user first. Returns:
```json
{ "reservation": { "id": "r_...", "slotId": "...", "slotCode": "B1-042", "floorId": "...", "floorName": "B1", "venueId": "...", "venueName": "Orion Mall", "status": "active", "createdAt": "...", "expiresAt": "...", "code": "SPOT-7K3Q" } }
```
`code` is a 4-char human code shown at the gate. Expired reservations free the slot and emit `reservation` + `slot` events.

### `GET /api/reservations/active` -> `{ "reservation": {...} | null }`
### `DELETE /api/reservations/:id` -> `{ "ok": true }` (frees slot)

### `POST /api/sessions` body `{ "reservationId" }` or `{ "slotId" }`
Starts a parking session ("I've parked"). Marks the slot occupied, marks reservation `converted`. 409 if slot not free/reserved-by-user.
```json
{ "session": { "id": "p_...", "slotId", "slotCode", "floorId", "floorName", "venueId", "venueName", "startedAt", "endedAt": null, "fee": 0, "paid": false, "rate": {...} } }
```
### `GET /api/sessions/active` -> `{ "session": {...} | null, "feeNow": 4000, "elapsedMinutes": 42 }`
### `POST /api/sessions/:id/pay` body `{ "method": "upi"|"card"|"cash" }`
Ends the session, computes fee, frees the slot. Returns `{ "session": {..., "endedAt", "fee", "paid": true, "paymentMethod"} , "receiptNo": "SP-2026-000123" }`.
### `GET /api/sessions` -> `{ "sessions": [...] }` newest first (history), each with `durationMinutes`.

Fee rule: `elapsed <= freeMinutes` -> 0. Else `firstHour + ceil(max(0, elapsed - 60) / 60) * perAdditionalHour`, capped at `dailyCap` per 24 h.

### `GET /api/users/me` / `PUT /api/users/me` body `{ name?, plate?, prefs? }`
### `GET /api/health` -> `{ "ok": true, "venues": 24, "slots": 2600, "uptimeS": 12 }`

Errors: `{ "error": { "code": "SLOT_NOT_FREE", "message": "..." } }` with proper HTTP status.

## Simulation (server-side, always on)
Every 4 s pick a venue-weighted random set of 1-3 free/occupied slots (never reserved, never in an active session) and flip them, biased toward a target occupancy derived from venue type and hour of day (malls peak 18-21, hospitals 09-13, metro 08-10 and 17-20, stadium random spikes, airport flat 70%). Emit SSE events. Sample `availability_history` each minute.

## Seed venues (Bengaluru, approximate real coordinates)
| id | name | type | lat | lng | floors x slots |
|---|---|---|---|---|---|
| v_orion | Orion Mall, Rajajinagar | mall | 13.0110 | 77.5551 | B2,B1,G = 3x120 |
| v_nexus_kora | Nexus Mall Koramangala | mall | 12.9346 | 77.6113 | B2,B1 = 2x140 |
| v_phoenix_wf | Phoenix Marketcity, Whitefield | mall | 12.9976 | 77.6963 | B2,B1,L1 = 3x150 |
| v_phoenix_moa | Phoenix Mall of Asia, Yelahanka | mall | 13.0637 | 77.5940 | B3,B2,B1 = 3x160 |
| v_ubcity | UB City, Vittal Mallya Rd | mall | 12.9719 | 77.5962 | B2,B1 = 2x90 |
| v_garuda | Garuda Mall, Magrath Rd | mall | 12.9707 | 77.6094 | B1,G = 2x100 |
| v_mantri | Mantri Square, Malleshwaram | mall | 12.9915 | 77.5703 | B2,B1 = 2x130 |
| v_lulu | Lulu Mall Bengaluru, Rajajinagar | mall | 12.9925 | 77.5498 | B2,B1,G = 3x140 |
| v_vega | Vega City Mall, Bannerghatta Rd | mall | 12.9089 | 77.6020 | B1,G = 2x100 |
| v_gopalan | Gopalan Innovation Mall, JP Nagar | mall | 12.9089 | 77.5940 | B1,G = 2x80 |
| v_manipal | Manipal Hospital, Old Airport Rd | hospital | 12.9592 | 77.6493 | B1,G = 2x90 |
| v_apollo | Apollo Hospital, Bannerghatta Rd | hospital | 12.8916 | 77.5974 | B1,G = 2x80 |
| v_fortis | Fortis Hospital, Bannerghatta Rd | hospital | 12.8946 | 77.5977 | G = 1x70 |
| v_mgroad | MG Road Metro (Park & Ride) | metro | 12.9756 | 77.6068 | G = 1x60 |
| v_indiranagar | Indiranagar Metro (Park & Ride) | metro | 12.9784 | 77.6386 | G = 1x50 |
| v_whitefield_m | Whitefield (Kadugodi) Metro | metro | 12.9955 | 77.7587 | G,L1 = 2x80 |
| v_ksr | KSR Bengaluru City Railway Station | rail | 12.9776 | 77.5713 | G,L1 = 2x110 |
| v_ypr | Yeshwanthpur Railway Station | rail | 13.0236 | 77.5511 | G = 1x80 |
| v_chinnaswamy | M. Chinnaswamy Stadium | stadium | 12.9788 | 77.5996 | G,L1 = 2x120 |
| v_kanteerava | Sree Kanteerava Stadium | stadium | 12.9694 | 77.5928 | G = 1x100 |
| v_kia | Kempegowda Intl Airport, P1 Multi-level | airport | 13.1989 | 77.7068 | L1,L2,L3 = 3x160 |
| v_lalbagh | Lalbagh West Gate Parking | public | 12.9507 | 77.5848 | G = 1x60 |
| v_church | Church Street MLCP | public | 12.9737 | 77.6083 | B1,G,L1 = 3x70 |
| v_jayanagar | Jayanagar 4th Block Complex | public | 12.9280 | 77.5836 | G = 1x60 |

Each venue gets 6-10% EV slots (near lifts) and 3-4% accessible slots (nearest the entrance). Rates: malls ₹40 first hr then ₹30/hr, cap ₹300, 15 free min; hospitals ₹30/₹20 cap ₹200 30 free min; metro/rail ₹20/₹10 cap ₹100; stadium ₹50/₹50 cap ₹500; airport ₹120 first hr then ₹80 cap ₹800 7 free min; public ₹20/₹20 cap ₹150 10 free min. Hospitals, airport, rail are 24x7; malls 10:00-23:00; metro 05:00-23:30; stadium 06:00-22:00; public 07:00-23:00.
