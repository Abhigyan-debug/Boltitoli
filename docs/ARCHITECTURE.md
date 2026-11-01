# Architecture

```
 Phone / laptop (PWA)                               Server
 ┌─────────────────────────────┐   HTTPS /api/v1   ┌──────────────────────────────────┐
 │ React + TanStack Query      │ ────────────────▶ │ FastAPI (thin routers)           │
 │ Session screen              │                   │  ├ services/ (business logic)    │
 │  ├ online controller ──────────── answers ────▶ │  ├ lesson_engine/ (deterministic)│
 │  └ offline controller       │                   │  ├ ai/claude_client (optional)   │
 │      └ TS lesson engine     │ ◀─ lesson packs ─ │  ├ speech/sarvam (optional)      │
 │ IndexedDB: packs, audio,    │ ── POST /sync ──▶ │  └ SQLAlchemy → PostgreSQL       │
 │   pending sessions, roster  │                   └──────────────────────────────────┘
 │ Service worker (app shell)  │
 └─────────────────────────────┘
```

## Backend (`backend/app`)

| Folder | Responsibility |
|---|---|
| `core/` | settings (env vars), JWT/bcrypt, JSON logging, error envelope, rate limiter |
| `db/`, `models/` | SQLAlchemy 2 models, UUID string keys, timestamps, naming convention for migrations |
| `schemas/` | Pydantic request/response models (also the OpenAPI docs) |
| `api/v1/` | thin routers; `deps.py` does authentication and role checks |
| `services/` | auth, access (tenant boundaries + audit), lessons, sessions, summaries, adaptive feedback, sync, analytics, AI drafting |
| `lesson_engine/` | Hindi answer parser, misconception rules, adaptive state machine, lesson content generator |
| `ai/` | Claude Messages API client with structured JSON output (`output_config.format`); provider health + circuit breaker |
| `speech/` | Sarvam STT/TTS adapters and `SpeechToTextService` / `TextToSpeechService` |
| `cli.py` | seed library, demo school, create official, apply retention |

Errors always use `{"error": {"code", "message", "details"}}`. Every request gets an `x-request-id`.
Logs never contain request bodies, transcripts or audio.

### Data model

`School` ─< `User` (teacher | school_admin | official*) · `School` ─< `Classroom` ─< `LearningGroup`
`Skill` ─< `Lesson` ─< `LessonVersion` (draft → reviewed) ─< `LessonQuestion`
`LearningGroup` ─< `Session` ─< `SessionResponse`; `Session` ─ `SessionSummary`
`GroupProgress` (per group × skill aggregates), `ConsentRecord`, `OfflineSyncEvent`, `AuditEvent`,
`RefreshToken` (rotation + reuse detection), `OfficialAccess` (explicit grant for CRC/block officials).

*Officials have no school of their own; they only see aggregates for schools granted to them.

Tenant boundary: every school-owned lookup goes through `services/access.py`, which returns 404 for
another school's rows (so existence isn't leaked).

### Lesson engine — the source of truth

`lesson_engine/engine.py` is pure and deterministic:

- **evaluate**: correct / incorrect / unclear (unparsed or unconfirmed speech is *never* graded).
- **detect_misconception**: off-by-one, counted one group, added instead of subtracted (and reverse),
  chose the smaller number, tens/ones swapped, reversed digits, before/after swapped.
- **apply_outcome**: 2 first-try correct in a row → harder; wrong → hint and retry; wrong again →
  explanation and easier; 2 unclear answers → suggest manual entry; 5 first-try correct at the hardest
  level → mastery signal (shown as a suggestion only).
- **pick_question**: unasked at the current level → least-recently asked at the current level → nearest
  other level (easier first). A struggling group never drifts to harder questions.

The offline engine (`frontend/src/features/sessions/engine`) mirrors it in TypeScript. Both are tested
against `shared/engine-fixtures.json`, generated from the Python engine. The server re-grades every
offline answer on sync, so a client bug can never corrupt records.

### AI usage and guardrails

| Use | Model (configurable) | Guardrail |
|---|---|---|
| Teacher summary | `ANTHROPIC_MODEL_SUMMARY` | Only statistics are sent (no group or child names). Output validated with Pydantic; rejected if it contains any number not in the statistics; level suggestion stays rule-based. |
| Explanation after a wrong answer | `ANTHROPIC_MODEL_FEEDBACK`, 4 s timeout, no retry | Only when a misconception was detected; numbers must come from the question; falls back to the authored explanation. |
| Drafting extra questions | summary model | Answers recomputed from operands; operand ranges per skill; numbers in the Hindi prompt must equal the operands; saved as a **draft** version that a teacher must review. |

Provider failures are tracked per provider; after 3 consecutive failures calls pause for 30 s so a live
session falls back instantly. Administrators see provider health in Settings.

### Speech

- **TTS**: lesson text is referenced by clip ref (`q:<id>:prompt`, `v:<id>:intro`, `p:<phrase>`), so only
  approved text can be synthesised and cached. Summaries use `/speech/tts` (not cached).
- **STT**: the browser records 16 kHz mono WAV (Sarvam does not accept WebM), auto-stops after silence,
  and releases the microphone immediately. Audio is sent once and discarded. Saaras returns no
  confidence score, so the transcript must be confirmed by a person before grading.

## Frontend (`frontend/src`)

| Folder | Responsibility |
|---|---|
| `app/` | router, providers, PWA update prompt |
| `components/ui`, `layout`, `brand` | design-system components (Radix primitives), app shell, logo |
| `components/three` | React Three Fiber scenes: `ClassroomHeroScene`, `BoltiToliSpeaker`, `CountingScene3D` |
| `components/illustrations` | 2D counting objects, bundles, number line, hero fallback |
| `features/*` | auth, dashboard, classrooms, groups, lessons, sessions (live + offline), analytics, reports, settings, onboarding, landing, offline storage/sync, voice |
| `services/queries.ts` | TanStack Query hooks |
| `lib/api.ts` | fetch wrapper: in-memory access token, httpOnly refresh cookie, single-flight refresh |

### One session screen, two controllers

`SessionView` renders the classroom screen from a `SessionModel` and `SessionActions`.
`useOnlineSession` implements them against the API (with idempotency keys reused on retry);
`useOfflineSession` implements them against IndexedDB and the TypeScript engine.
If the network drops mid-session, the teacher can **Continue offline** from the same question; the
lesson pack is saved to the device whenever an online session starts.

### Offline sync

`PendingSession` records hold only group id/name, lesson version, timings and typed answers.
`syncPending()` uploads batches of 10 to `POST /sync`; `accepted` and `duplicate` both remove the local
record; failures stay as `sync_failed` and retry on the next `online` event.

## API (all under `/api/v1`)

Auth: `POST /auth/register|login|refresh|logout|demo`, `GET/PATCH /auth/me`, `POST /auth/change-password`
School: `GET /schools`, `GET/PATCH /schools/current`, staff, consents, audit, retention, delete data
Classrooms & groups: `GET/POST /classrooms`, `PATCH /classrooms/{id}`, `GET/POST /groups`, `GET/PATCH /groups/{id}`
Lessons: `GET /skills`, `GET /lessons`, `GET /lessons/{id}`, versions, `POST review`, `POST draft-questions`
Packs: `GET /lesson-packs`, `GET /lesson-packs/{lesson_id}`
Sessions: `GET/POST /sessions`, `GET /sessions/active`, `GET /sessions/{id}`, `POST start|answer|adjust|pause|resume|end`, `GET summary`
Speech: `GET /speech/status`, `POST /speech/transcribe`, `GET /speech/clip`, `POST /speech/tts`, `POST /speech/prepare/{lesson_id}`
Other: `GET /analytics/overview|groups`, `GET /reports/sessions.csv`, `POST /sync`, `GET /health`, `GET /health/ready`, `GET /admin/providers`

`POST /sessions/{id}/answer` accepts an `Idempotency-Key` header; repeating it returns the stored feedback.
