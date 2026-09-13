# Parko / SpotOn superpower note

## North star
SpotOn ("Your spot, sorted."): a smart parking finder for malls and public places in Bengaluru. HCI course project by Dhruv, built to feel like a real startup launch (the evaluator is the first user). Working model hosted locally, iterated continuously. Final project report (15-section format) comes later, format to be decided by Dhruv.

## Stack (decided 2026-09-13)
- Client: Vite 8 + React 19 + Leaflet 1.9 (OpenStreetMap tiles). Mobile-first, PWA-installable (manifest + apple meta + sw.js), desktop split layout.
- Server: Express 5 + built-in `node:sqlite` (Node 22.19, no native deps) + Server-Sent Events for live slot updates. Backend simulates occupancy continuously.
- Deps are ONLY: react, react-dom, leaflet, express, vite, @vitejs/plugin-react. Ask before adding any other.
- Root `npm run dev` starts both (dev.mjs). Client :5173 proxies /api to server :3001.
- Code lives at `/Volumes/Dhruv's SSD/Parko`. GitHub: https://github.com/DhruvLekhi06/Parko (ask before every push).

## Key files
- `docs/API.md` API contract + floor layout format + seed venue list (source of truth for client/server agreement)
- `docs/DESIGN.md` design brief (journeys, visual system, copy tone, PWA)
- `server/` Express API, seed, simulation, route BFS
- `client/` React app

## Decisions (newest on top)
- 2026-09-13: no more specialist agents on this project after the initial server+client build; Claude edits directly (Dhruv).
- 2026-09-13: slot count is 5120 (table rows read as floors x slots per floor). Fine for the demo.
- 2026-09-13: `trend` = direction of the FREE count over 30 min (rising = opening up).
- 2026-09-13: floor plan on narrow screens starts zoomed on the slot that matters (yours, else "Best for you"); the Fit button shows the whole floor.
- 2026-09-13: zero-fee exit shows "Exit for free" with no payment method picker.
- 2026-09-13: driver app only, no operator panel, no study mode (Dhruv: "make an app like I'm launching this startup").
- 2026-09-13: app name SpotOn (repo is Parko). Bengaluru venues, real Leaflet map.
- 2026-09-13: SQLite via node:sqlite instead of better-sqlite3 to avoid a native build; SSE instead of ws to avoid a dep.

## Gotchas
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
- 2026-09-13: v0.1 working model DONE and verified in Chrome (desktop + phone frame): explore map/list with live SSE counts, venue detail with sparkline, floor plan, hold slot + animated route + gate code, I've parked, My Car timer/fee, find my car (reversed route), pay & exit (UPI/card/cash) + receipt, profile + history, PWA install tags, first-launch welcome. `npm run dev` then http://localhost:5173 (LAN: http://<mac-ip>:5173 for the phone).
- Next: Dhruv reviews on device and lists iteration requests; then the report (format TBD).
