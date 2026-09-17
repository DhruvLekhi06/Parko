# Parko / SpotOn superpower note

## North star
SpotOn ("Your spot, sorted."): a smart parking finder for malls and public places in Bengaluru. HCI course project by Dhruv, built to feel like a real startup launch (the evaluator is the first user). Working model hosted locally, iterated continuously. Final project report (15-section format) comes later, format to be decided by Dhruv.

## Launch direction (2026-09-16, Dhruv: "make it fully functional like we need to launch this product")
- Hosting: Supabase Postgres + Railway API + Vercel client, all free tiers, NEW projects (not linked to AstroAura). Dhruv creates them and supplies DATABASE_URL / keys per session.
- No login yet: device profile (UUID in localStorage sent as X-User-Id). Payments: FASTag-style auto-debit only (simulated wallet, ₹500 welcome credit, flat hold fee per venue type, parking fee auto-debited at exit, hold fee credited against the parking fee, full refund if cancelled within 5 min).
- Maps: nicer tiles + OSRM road routing now; realistic floor plan + 2.5D view; Google Maps provider when a key exists.
- "fast track linking" = FASTag ID linked per vehicle in the profile.

## Stack (updated 2026-09-16)
- Client: Vite 8 + React 19 + Leaflet 1.9 (OpenStreetMap tiles). Mobile-first, PWA-installable (manifest + apple meta + sw.js), desktop split layout.
- Server: Express 5 + Postgres via `pg` (local Postgres 18 for dev: db `parko`, user `parko`; Supabase in prod via DATABASE_URL) + SSE. Simulation + expiry + history sampler run in-process. OSRM public demo for road ETA/directions (ROUTING_URL to swap). node:sqlite is gone.
- Deps are ONLY: react, react-dom, leaflet, express, pg, vite, @vitejs/plugin-react. Ask before adding any other.
- Root `npm run dev` starts both (dev.mjs). Client :5173 proxies /api to server :3001.
- Code lives at `/Volumes/Dhruv's SSD/Parko`. GitHub: https://github.com/DhruvLekhi06/Parko (ask before every push).

## Key files
- `docs/API.md` API contract + floor layout format + seed venue list (source of truth for client/server agreement)
- `docs/DESIGN.md` design brief (journeys, visual system, copy tone, PWA)
- `server/` Express API, seed, simulation, route BFS
- `client/` React app

## Decisions (newest on top)
- 2026-09-17: No Railway. Hosting = Vercel (client static + API as ONE serverless function `api/index.js` wrapping `server/app.js`, region hnd1 next to Supabase) + Supabase. In serverless mode (`process.env.VERCEL` or `SERVERLESS=1`): `/api/events` returns 404 and the client polls `GET /api/live?venues=&floor=` every 8 s (`useLiveEvents` falls back automatically, screens register what they watch via `live.watch(key, spec)`); hold expiry runs on every /api request (throttled 5 s) and history sampling every 10 min inside requests; migration is NOT run on boot (run `npm run migrate` manually or set MIGRATE_ON_BOOT=1). `server/index.js` is the local always-on server (SSE + timers).
- 2026-09-17: Standard parking price everywhere (Dhruv): ₹50 covers the first hour from the moment you park (no free window), then ₹30 for every started 30 min, ₹600/day cap; booking ₹20 per 15 min credited at exit. `server/fees.js` STANDARD_RATE + `computeFee`, mirrored in `client/src/lib/format.js` feeFor/rateLine; `db.js` migration rewrites any old rate JSON.
- 2026-09-17 (evening): Bengaluru coverage = every named mall, hospital, metro/rail station, stadium, multi-storey car park, attraction, cinema, bus station and aerodrome from OpenStreetMap (Overpass, bbox 12.72,77.35,13.30,77.90) via `server/import_bengaluru.js` (idempotent, `v_osm_<id>`, dedupes against seeded venues, localities derived from an embedded list so "koramangala" search works). Local DB now 1,601 venues / 175k slots. Overpass needs a User-Agent header (406 otherwise); `OVERPASS_FILE=path.json` replays a saved response.
- 2026-09-17: `/api/venues` returns the nearest 80 (`limit` up to 200) + `total`; search (`q`) is citywide across all cities with name matches ranked first. Floor counts and trend baselines are computed only for the returned ids. History is sampled every 10 min (was 1 min) to keep the table small at 1,600 venues.
- 2026-09-17: Booking UX: confirm sheet before +/-15 min (shows new end time and charge/refund), no drive-time anywhere except the Find parking navigation screen, policy shown as one muted line, no info boxes.
- 2026-09-17 (late): Bookings are time based: 15/30/60 min picker, price = holdFee per 15 min block (₹20 → ₹20/₹40/₹80 at malls), credited at exit; +/-15 min stepper on the live booking (charges/refunds a block, max 4 h, cannot shorten under 5 min left). Refund tiers: 100% within 5 min of booking, 50% after, 0% in the last 10 min (`server/fees.js` refundFor, mirrored in `HoldCard.refundNow`). ETA no longer decides the hold window.
- 2026-09-17: Onboarding is mandatory: splash → create account / log in (email + password) → link FASTag (plate, issuer bank, tag ID) → app. No guest browsing (needsOnboarding in `screens/Onboarding.jsx`).
- 2026-09-17: Slide-to-confirm (`components/SlideToConfirm.jsx`) on pay/book/exit: rAF-driven drag, keyboard confirm, check-draw success animation, haptic.
- 2026-09-17: Accounts: `server/auth.js` (scrypt hashes, HMAC-signed tokens, SESSION_SECRET), signup migrates the device guest's vehicles/holds/sessions/transactions/wallet into a new `u_` account row; device row stays a guest. No welcome credit (WELCOME_CREDIT_PAISE=0). Simulation and synthetic history are OFF in production (SIM_ENABLED / SEED_SYNTHETIC), slots seed free and operators set occupancy in the portal Floors tab.
- 2026-09-17: Operator portal tabs: Overview, Venues (editor: name, address, hours, 24h, published, amenities, rates), Floors (tap-to-toggle slots, all free/occupied, set count), Activity, Users, Transactions. Key = ADMIN_KEY (required in production).
- 2026-09-17: Activity tab (4th nav item): Parking (sessions + bookings grouped by day, detail sheet) and Wallet (ledger with running balance). Profile no longer holds history.
- 2026-09-17: Deploy files: `vercel.json` (client, output client/dist, SPA rewrite), `railway.json` (build + start, health check). README has the 4-step deploy.
- 2026-09-17: Venue CTA is "Book slot" (goes to the garage map with the best slot preselected, `?book=1`; BookSheet pays the fee from the wallet, shows the barcode ticket) and "Find parking" (`/go/:venueId`, route map + Start navigation via Google Maps + "I've arrived, pick a spot" → floor `?park=1` where the slot card's primary is "I've parked here"). No more auto-hold from the venue page.
- 2026-09-17: Operator portal at `/admin` (link at the bottom of Profile). Key = `ADMIN_KEY` env (dev default `spoton-admin`), stored in localStorage `spoton.admin`, sent as `X-Admin-Key`. Tabs: Overview (tiles + by city), Venues (live table, per-venue rate editor), Activity (bookings + parking), Users, Transactions. API in `server/routes/admin.js`.
- 2026-09-17: Gate ticket = `Ticket` component (HoldCard.jsx) with a Code 128 barcode drawn in SVG (`components/Barcode.jsx`, no dep).
- 2026-09-17: LIGHT theme is final (Dhruv: "light mode itself, no ai ui, straight hci principle, clean ui"). Tokens: bg #f5f6f8, surface white, ink #111827, primary green #0e8a5f (white text passes AA), amber #d97706 (dark text on amber pins), semantic amber warning banner, no glass/blur/gradients, radius 12/10. Dark tokens are gone; the dark pass survives only as the glanceable layout (stat strip, count-first rows, two-option CTA).
- 2026-09-16 (superseded 09-17 by light): UI direction = dark, map-first (Uber/Ola feel), glanceable, rebuilt directly on the live app (Dhruv: "not happy with the UI", picked dark map-first, rebuild directly). Tokens in `:root` are now dark; surfaces over the map are glass (`--glass` + backdrop blur); primary buttons are green with dark text (`--on-green`).
- 2026-09-16: Map tiles = standard OSM tiles with a CSS invert/hue-rotate filter (`.tiles-dark`). CARTO dark basemaps now watermark "API KEY REQUIRED" without a key, so they were dropped.
- 2026-09-16: Explore map fits user + nearest 4 venues (`fit` prop on VenueMap); My Car shows the OSRM drive route (`route` prop) with a phone-size map above the ticket and the full stage on desktop.
- 2026-09-16: Phase 2 client: device id in localStorage (`spoton.device`), holds replace reservations, FASTag wallet + vehicles in Profile, ExitSheet auto-debit with top-up-and-retry on 402, WalletSheet, welcome collects plate + FASTag.
- 2026-09-16: Phase 1 server port done: Postgres schema (users, vehicles, venues, floors, slots, holds, sessions, transactions, availability_history, receipt_seq), 106 venues in 6 cities (Bengaluru 60, Mumbai, Delhi NCR, Hyderabad, Chennai, Pune), holds replace reservations (`/api/holds`, `/api/reservations` kept as alias), `/api/vehicles`, `/api/wallet`, `/api/venues/:id/directions`, history backfill on boot. Verified with scratchpad smoke test (22 checks).
- 2026-09-13: no more specialist agents on this project after the initial server+client build; Claude edits directly (Dhruv).
- 2026-09-13: slot count is 5120 (table rows read as floors x slots per floor). Fine for the demo.
- 2026-09-13: `trend` = direction of the FREE count over 30 min (rising = opening up).
- 2026-09-13: floor plan on narrow screens starts zoomed on the slot that matters (yours, else "Best for you"); the Fit button shows the whole floor.
- 2026-09-13: zero-fee exit shows "Exit for free" with no payment method picker.
- 2026-09-13: driver app only, no operator panel, no study mode (Dhruv: "make an app like I'm launching this startup").
- 2026-09-13: app name SpotOn (repo is Parko). Bengaluru venues, real Leaflet map.
- 2026-09-13: SQLite via node:sqlite instead of better-sqlite3 to avoid a native build; SSE instead of ws to avoid a dep.

## Gotchas
- Supabase (prod DB, wired 2026-09-17): session pooler `aws-0-ap-northeast-1.pooler.supabase.com:5432`, user `postgres.myitjwgthsdlldiojqvi`, SSL. Password only in the gitignored `.env` (never here). Pooled connections take ~4 s to open and the role's statement_timeout is 2 min, so `db.js` sets `statement_timeout = 600s` per connection and runs the migration statement by statement. The local Postgres (`parko`) remains the fast dev DB: comment out DATABASE_URL in `.env` to use it.
- Push: `gh auth switch -u DhruvLekhi06 && git push; gh auth switch -u DhruvStratnova` (the default active gh account has no access to DhruvLekhi06/Parko). First push done 2026-09-17.
- Install prompt (`hooks/useInstall.js`, `components/InstallBanner.jsx`) only fires on https or localhost with the production build (`npm run build && npm start` → http://localhost:3001). On the LAN dev URL Android shows nothing; iOS gets the Add to Home Screen steps.
- Chrome MCP could not type into the portal's password field (Chrome's password popup stole focus); setting `localStorage.spoton.admin` then reloading works for testing. Real users type normally.
- History backfill: seeded 24h history expires when the server is off for a day; `backfillHistory()` on boot refills any venue with sparse history so sparklines never show "No history yet".
- `db.js` uses AsyncLocalStorage so `tx(fn)` binds one client for every query inside fn; `notifyVenue` deliberately escapes the tx via setTimeout so SSE reads use the pool.
- OSRM demo server: 2.5 s timeout, 30 s circuit breaker, 120 s cache; venues fall back to etaSource "estimate".
- Leaflet panes use z-index 200-700. Every map container needs its own stacking context (`.vmap { isolation: isolate }`) or the map paints over fixed overlays (welcome, modals). Bit us on the desktop split layout.
- Chrome MCP cannot resize a maximised window. For phone-width checks serve an iframe harness (390x844 iframes to localhost:5173) from the scratchpad with `python3 -m http.server`.
- An SVG `<mask>` inside a CSS-transformed `<g>` renders nothing in Chrome; the route draw-in is a rAF partial polyline instead.
- Simulation flips about 30 slots/min across all venues; set `SIM_INTERVAL_MS=1000` for a livelier demo.
- My Car pauses its 30 s session poll while the payment sheet is open, otherwise the poll can null the session and unmount the receipt mid-flow.
- Chrome MCP drops the first click after a `navigate` until a screenshot refreshes its coordinate frame. Screenshot first, then click. Not an app bug (verified with a document click logger).
- First-launch flag is `localStorage['spoton.welcomed']`; clear it to see the welcome screen again.
- Seeded demo user is "Demo Driver / KA 01 AB 1234"; the welcome screen pre-fills it.
- SSD writes from Bash need `dangerouslyDisableSandbox`.
- PWA service worker only registers on https or localhost. On a phone over LAN (http://192.168.x.x:5173) use iOS "Add to Home Screen" (works via apple meta tags); Android install prompt needs https.
- node:sqlite prints an ExperimentalWarning on Node 22; harmless.

## Current state
- 2026-09-17 14:30: serverless mode tested locally (SERVERLESS=1). Vercel env needed: DATABASE_URL (Supabase TRANSACTION pooler, port 6543), SESSION_SECRET, ADMIN_KEY, NODE_ENV=production, SIM_ENABLED=0, SEED_SYNTHETIC=0, WELCOME_CREDIT_PAISE=0. Deploy = import GitHub repo in Vercel (needs the push).
- 2026-09-17 13:45: local app now runs against Supabase (`.env` DATABASE_URL), simulation and synthetic history off. Base 106 venues seeded; the 1,495-place Bengaluru import is running in the background (log in the session scratchpad). Next: Railway API + Vercel client deploy once Dhruv creates those projects.
- 2026-09-17 evening: full flow verified end to end on desktop + phone frame (splash → account → FASTag → book 30 min → slide to pay → top-up and book → ticket → +15 with confirm → parked → slide to exit → receipt → activity). Supabase project created by Dhruv (ref myitjwgthsdlldiojqvi, Tokyo); wiring pending his connection string (goes in gitignored `.env`, never in notes).
- 2026-09-16: v0.2 running locally on Postgres: launch flow (hold ₹20 by venue or slot → drive with route → I've parked → exit auto-debit → receipt), profile with wallet/vehicles/FASTag, dark map-first UI. Verified in Chrome desktop + phone frames. Next: Phase 3 (realistic floor plan + 2.5D view, Google Maps provider when key exists), then hosting (Dhruv to create Supabase/Railway/Vercel projects).
- 2026-09-13: v0.1 working model DONE and verified in Chrome (desktop + phone frame): explore map/list with live SSE counts, venue detail with sparkline, floor plan, hold slot + animated route + gate code, I've parked, My Car timer/fee, find my car (reversed route), pay & exit (UPI/card/cash) + receipt, profile + history, PWA install tags, first-launch welcome. `npm run dev` then http://localhost:5173 (LAN: http://<mac-ip>:5173 for the phone).
- Next: Dhruv reviews on device and lists iteration requests; then the report (format TBD).
