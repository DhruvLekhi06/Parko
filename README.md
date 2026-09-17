# SpotOn (Parko)

Smart parking finder for malls and public places in Bengaluru. HCI project.

```bash
npm install
npm run dev        # client http://localhost:5173, API http://localhost:3001
npm run build && npm start   # production: API serves client/dist on :3001
```

Docs: `docs/API.md`, `docs/DESIGN.md`, `SUPERPOWER.md`.

## Deploying (free tiers, no always-on server needed)

1. **Supabase** (Postgres): project created, schema migrated, venues seeded (`npm run migrate`, `npm run seed`, `npm run import:bengaluru` against `DATABASE_URL`).
2. **Vercel** (client + API as serverless functions): import the repo, framework "Other", build `npm run build`, output `client/dist` (already in `vercel.json`, functions run in Tokyo next to Supabase). Environment variables:
   - `DATABASE_URL` = the Supabase **transaction pooler** URI (port 6543) with the password
   - `SESSION_SECRET` = a long random string
   - `ADMIN_KEY` = the operator portal key
   - `NODE_ENV=production`, `SIM_ENABLED=0`, `SEED_SYNTHETIC=0`, `WELCOME_CREDIT_PAISE=0`
3. Open the Vercel URL on a phone: Android shows the install prompt, iOS uses Share, Add to Home Screen.

On Vercel the API runs per request: live updates come from polling `/api/live` every 8 s (the event stream is only used by the local server), booking expiry and history sampling run inside requests. `npm run dev` locally still runs the full server with the live stream and timers.

