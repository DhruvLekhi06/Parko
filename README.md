# SpotOn (Parko)

Smart parking finder for malls and public places in Bengaluru. HCI project.

```bash
npm install
npm run dev        # client http://localhost:5173, API http://localhost:3001
npm run build && npm start   # production: API serves client/dist on :3001
```

Docs: `docs/API.md`, `docs/DESIGN.md`, `SUPERPOWER.md`.

## Deploying (free tiers)

1. **Supabase** (Postgres): create a project, copy the connection string (use the "Session" pooler URI on port 5432 or the direct URI).
2. **Railway** (API): new project from this GitHub repo. Variables: `DATABASE_URL`, `SESSION_SECRET` (long random string), `ADMIN_KEY` (operator portal key), `NODE_ENV=production`, `CORS_ORIGIN=https://<your-vercel-domain>`. Railway runs `npm ci && npm run build` then `npm start`; the API also serves the built client, so Railway alone works too.
3. **Vercel** (client): import the repo, framework "Other", build `npm run build`, output `client/dist` (already in `vercel.json`). Variable: `VITE_API_URL=https://<your-railway-domain>`.
4. Open the Vercel URL on a phone: Android shows the install prompt, iOS uses Share, Add to Home Screen.

Production defaults: no occupancy simulation and no synthetic history (`SIM_ENABLED=1` / `SEED_SYNTHETIC=1` re-enable them for demos). Slots seed as free; operators set live occupancy in the portal (Floors tab). Wallet top-ups are instant placeholders until a payment gateway is connected.

