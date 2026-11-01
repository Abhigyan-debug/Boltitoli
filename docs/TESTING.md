# Testing

| Layer | Tool | Where | What it covers |
|---|---|---|---|
| Lesson engine | pytest + Vitest | `backend/tests/test_engine.py`, `frontend/src/features/sessions/engine/engine.test.ts` | Hindi parser (28 cases), misconceptions (10), adaptive scenarios (6) from **shared fixtures**; content answer keys; illustrations match questions |
| API | pytest + FastAPI TestClient | `backend/tests/` | auth (rotation, reuse, expiry, enumeration), roles, tenant isolation, full session workflow, idempotency, stale answers, unclear speech, overrides, adjust, review flow, consent/retention |
| Providers | pytest + respx (mocked HTTP) | `test_providers.py` | Claude request shape, grounding rejection, 529 retries, timeouts, circuit breaker; Sarvam STT/TTS shape, confirmation, ambiguous speech, bad audio, caching; AI drafting validation |
| Offline sync | pytest + Vitest | `test_sync_analytics.py`, `offline/sync.test.ts` | server re-grading, duplicates, foreign questions/groups; client queue, network failure, retries, rejection |
| Analytics & reports | pytest | `test_sync_analytics.py` | empty dashboard, measured totals, CSV, officials |
| Ops | pytest | `test_sync_analytics.py` | health/readiness, database failure → 503, migrations up/check/down |
| Components | Vitest + Testing Library | `*.test.tsx` | number pad, microphone status honesty, counting illustration, API client refresh |
| End-to-end | Playwright + axe | `frontend/e2e/` | register → onboarding → session (hint, correct) → summary; offline download → run → sync; validation; accessibility; mobile overflow |

## Running

```bash
cd backend && pytest -q
TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost/bt_test pytest -q   # PostgreSQL
cd frontend && npm test
cd frontend && npx playwright install chromium && npx playwright test
# or with an existing Chromium:
PW_CHROMIUM_PATH=/path/to/chrome npx playwright test
```

Playwright starts its own backend (fresh SQLite, rate limits off) and a production build preview.

**Language:** the app defaults to Hindi, so `teacher-flow.spec.ts` sets `localStorage["bt-lang"] = "en"` before
each test and keeps using the English labels.

**Provider keys:** the e2e backend is started with empty `ANTHROPIC_API_KEY` and `SARVAM_API_KEY`, which override
`backend/.env`. Without that, a local run with real keys calls (and pays for) Claude and Sarvam and gets slower.

**On Windows** the `webServer` commands in `playwright.config.ts` do not run (they use `rm -f /tmp/...` and
`VAR=value cmd`). Outside CI the config reuses servers that are already running, so start them yourself:
the backend on port 8000 (migrate, `python -m app.cli seed`, then `uvicorn` with `RATE_LIMIT_ENABLED=false`,
`ANTHROPIC_API_KEY=` and `SARVAM_API_KEY=`) and
`npx vite preview --port 4173` after `npm run build`, then run `npx playwright test`.

Note: CI's headless browser usually has no WebGL, so it only exercises the 2D illustrations. Run the e2e suite
locally in real Chrome (`PW_CHROMIUM_PATH=...chrome.exe`) to cover the 3D path; that is how the offline 3D
crash fixed on 31 Oct 2026 was found.

## Latest local run (31 Oct 2026, Windows 11, Chrome, Python 3.12, Node 22)

| Suite | Result |
|---|---|
| Backend pytest (SQLite) | 93 passed |
| Ruff lint | clean (`ruff format --check` would reformat 37 files; CI does not run it) |
| Alembic upgrade → check → downgrade (SQLite) | passed |
| Vitest | 64 passed (adds `ThreeBoundary.test.tsx`) |
| ESLint, `tsc -b` | clean |
| Production build | passed |
| Playwright e2e in real Chrome | 6 passed — re-run after the full UI redesign; the only test edit was the dashboard button's new label "Start 15-minute Session" |
| PostgreSQL tests | not run (no Docker daemon / PostgreSQL on this machine) |

Checked by hand in the browser after the redesign (screenshots in `docs/screenshots/`): landing at 1366 px and
390 px, dashboard, live session (intro, question, correct answer — the celebration was measured on screen for ~1.9 s),
summary, groups, lessons, progress; no horizontal scroll at 390 px on `/app`, groups, lessons, progress, sessions,
classrooms, settings. Not checked: frame rate of the 3D scenes on a real low-end phone (those phones get the 2D
illustrations automatically), and the old `landing.png` / `session-*.png` screenshots, which still show the
pre-redesign UI and are no longer linked from the README.

## Changing engine rules

1. Edit `backend/app/lesson_engine/engine.py`.
2. `PYTHONPATH=. python scripts/build_engine_fixtures.py` to regenerate `shared/engine-fixtures.json`.
3. Update `frontend/src/features/sessions/engine/engine.ts` until `npm test` passes.
