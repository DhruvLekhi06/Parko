# SpotOn design brief

**Product**: SpotOn, "Your spot, sorted." A smart parking finder for malls and public places in Bengaluru. Built as an HCI course project but it must look and feel like a real startup launch. The evaluator is the first user.

**Form factor**: mobile-first responsive web app, installable as a PWA (manifest + apple meta tags + minimal service worker). Desktop (>= 960px) uses a split layout: 420px left panel (lists, sheets, details) + map/floor plan filling the right. Below 960px everything is a single column with a bottom nav and bottom sheets.

## Core user journeys (all must work end to end against the API in API.md)
1. **Find**: open app -> see map of Bengaluru with venue pins coloured by availability + a bottom sheet listing nearest venues (name, type icon, distance, ETA, free/total with fill bar, ₹ first-hour rate, open/closed). Search by name, filter chips by type, EV, accessible. Live counts update via SSE without reload.
2. **Choose**: tap a venue -> detail: hero (name, type, address, open hours, rating-free), big "free now" number with trend arrow, 24h availability sparkline, amenities, rates, floor list with per-floor free counts, "View slots" and "Directions" (opens Google Maps link `https://www.google.com/maps/dir/?api=1&destination=lat,lng`).
3. **Pick a slot**: floor plan as pinch/scroll-zoomable SVG. Slots coloured by status, EV/accessible icons, entrances, lifts, pillars, zone labels. "Best for you" badge on `recommendedSlotId`. Tap slot -> slot card (code, type, distance from entrance, walk time) -> "Reserve for 15/30/60 min".
4. **Reserve + route**: after reserving, floor plan draws the animated route from the entrance to the slot (dashed path drawing in) and a step list. Card shows countdown, gate code, "Cancel", and "I've parked".
5. **Parked (My Car tab)**: where-did-I-park card (venue, floor, slot code, time in, plate), live timer, running fee in ₹, "Find my car" (route again, reversed steps), "Pay & exit" -> payment sheet (UPI / Card / Cash, big single button, fake 1.2 s processing) -> receipt (fee, duration, receipt no) -> back to Explore.
6. **Profile**: name, plate (formatted like KA 01 AB 1234), preferences (needs EV, needs accessible), history list with fees.
7. **First launch**: one-screen welcome asking name + plate + prefs (skippable). Stored via PUT /api/users/me and localStorage flag.

## Visual system
- Font: Inter (Google Fonts link, system-ui fallback). Numbers use `font-variant-numeric: tabular-nums`.
- Colours: bg `#F6F7F9`, surface `#FFFFFF`, ink `#0B1220`, muted `#5B6B7F`, line `#E6EAF0`.
  Brand green `#0BB57A` (primary buttons, free), deep green `#087A53`. Amber `#F5A524` (reserved / filling). Red `#E5484D` (full / occupied venue level). Occupied slot: `#CBD2DC` (calm grey, never red, so the free ones pop). EV: `#1C7ED6` accent. Accessible: `#7048E8` accent. Your slot: ink `#0B1220` with a soft pulse ring.
- Radius 16px cards, 12px controls, 999px chips. Shadows soft and layered (`0 1px 2px rgba(11,18,32,.06), 0 8px 24px rgba(11,18,32,.08)`).
- Motion: bottom sheet snaps (peek / half / full) with drag; slot status changes cross-fade; counts animate; route path uses stroke-dashoffset draw-in; skeleton loaders, never spinners for lists.
- Touch targets >= 44px. Contrast AA. Focus rings visible. `prefers-reduced-motion` respected.
- Icons: inline SVG (no icon library). Venue type glyphs: mall (bag), hospital (cross), metro (train), rail (train front), stadium (flag), airport (plane), public (pin).
- Empty/edge states designed: location denied (use default centre with a banner), venue closed, venue full (suggest 2 nearest alternatives with free slots), reservation expired, offline (SSE dropped -> "Reconnecting" pill).
- No em dashes anywhere in copy. Use commas or periods.

## Copy tone
Short, confident, friendly. "61 spots free", "Filling up fast", "Best for you", "Hold this spot", "I've parked", "Find my car", "Pay & exit". Currency as ₹40, never "INR 40.00".

## PWA
`client/public/manifest.webmanifest` (name "SpotOn", short_name "SpotOn", display standalone, theme `#0BB57A`, background `#F6F7F9`, portrait, icons 192/512 as SVG + PNG), `<meta name="apple-mobile-web-app-capable">`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`, `theme-color`. `client/public/sw.js`: cache app shell on install, network-first for `/api`, cache-first for static. Register only in production and secure contexts.
