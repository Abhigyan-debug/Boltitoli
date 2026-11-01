# Deployment

BoltiToli is two deployables: a static PWA (frontend) and a FastAPI service (backend) with PostgreSQL.

## Recommended shape

**Same origin (simplest):** serve the PWA and proxy `/api` to the backend from one domain (the
included `deploy/nginx.conf` does this). The refresh cookie then works with `SameSite=Lax`.

- Frontend: any static host or the `frontend/Dockerfile` (nginx).
- Backend: any container host (Render, Railway, Fly.io, Google Cloud Run, AWS App Runner, a VM).
- Database: managed PostgreSQL 15+ (Neon, Supabase, RDS, Cloud SQL) — create it with **UTF8** encoding.

**Separate origins** (e.g. frontend on Vercel/Netlify, API elsewhere): build the frontend with
`VITE_API_BASE_URL=https://api.example.org`, and on the backend set
`CORS_ORIGINS=https://app.example.org`, `REFRESH_COOKIE_SECURE=true`, `REFRESH_COOKIE_SAMESITE=none`.

## Backend production settings

```
ENVIRONMENT=production
DATABASE_URL=postgresql+psycopg://USER:PASS@HOST:5432/boltitoli
JWT_SECRET=<48+ random characters>
REFRESH_COOKIE_SECURE=true
CORS_ORIGINS=https://your-domain
DEMO_MODE_ENABLED=false
LOG_LEVEL=INFO
TRUSTED_PROXY_HOPS=1            # proxies that append to X-Forwarded-For: Render = 1, Vercel + Render = 2
```

**Rate limits and the visitor address.** Limits are keyed by the visitor's IP, read from the
`X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` from the right (the one our own proxy wrote; entries further
left can be forged). After deploying, confirm real visitor IPs reach the API; with the wrong value either
every visitor shares one limit or the limit can be bypassed. Calling the Render URL directly (skipping
Vercel) can still forge one hop when `TRUSTED_PROXY_HOPS=2`; set a spending limit on the provider keys.

Limits: register/login/demo 10/min, token refresh 30/min, speech 60/min (TTS clip 20/min), answers 60/min,
ending a session 10/min, AI question drafting 5/min. They are per process and in memory.

**Public demo school** (`DEMO_MODE_ENABLED=true`). Every visitor shares one demo school, so it is protected:
changing the school, staff, consent records, retention, deleting data, editing the demo profile or password,
reviewing lessons (the lesson library is shared by all schools) and AI drafting return
`403 demo_read_only`. Visitors can still run sessions, create groups and view everything. The demo school is
rebuilt automatically on the first demo login after it is 24 hours old.

With `ENVIRONMENT=production` the API refuses to start if the JWT secret is the default/short, the
database is SQLite, or cookies are not secure.

Start command (the Dockerfile uses this):
```
alembic upgrade head && python -m app.cli seed && uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers
```
Health checks: liveness `GET /api/v1/health`, readiness `GET /api/v1/health/ready` (checks the database).

Run behind HTTPS. Rate limits are per process (in memory); for multiple instances put a rate limit at
the proxy or switch `slowapi` to a Redis storage backend.

`TTS_CACHE_DIR` holds generated Hindi audio (not children's data). Mount a persistent volume or accept
regeneration after redeploys.

## Database backups

- Use your provider's automated daily backups with point-in-time recovery (7–30 days).
- Or nightly: `pg_dump --format=custom "$DATABASE_URL" > boltitoli-$(date +%F).dump`, stored encrypted
  off-site; restore with `pg_restore --clean --dbname "$DATABASE_URL" file.dump`.
- Test a restore every term.
- Schedule `python -m app.cli apply-retention` daily (cron / scheduled job) to enforce each school's
  retention period.

## Frontend

```
cd frontend && npm ci && npm run build      # outputs dist/
```
Serve `dist/` with SPA fallback to `index.html`. Do **not** cache `sw.js` or `manifest.webmanifest`
long-term; hashed `/assets/*` can be cached for a year. HTTPS is required for the microphone and the
service worker.

## Checklist before a school pilot

- [ ] HTTPS on all origins; `REFRESH_COOKIE_SECURE=true`
- [ ] Strong `JWT_SECRET`, stored as a secret
- [ ] PostgreSQL with backups and a tested restore
- [ ] `DEMO_MODE_ENABLED=false` (unless intentionally public)
- [ ] Provider keys set (optional) and provider health checked in Settings
- [ ] Lessons reviewed by a teacher in the app
- [ ] Consent/authorisation process agreed and recorded (see PRIVACY.md)
- [ ] Tested on the actual phones and Bluetooth speakers the school will use
