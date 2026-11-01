# Status: what works, what was tested, what still needs validation

This file is deliberately candid. BoltiToli is a working product, **not yet validated in a real classroom**.

## Definition of done — checked

| # | Teacher can… | Status | Verified by |
|---|---|---|---|
| 1 | Register and securely log in | ✅ | pytest (auth), Playwright e2e |
| 2 | Create a classroom and learning groups | ✅ | pytest, Playwright (onboarding) |
| 3 | Select a maths skill and a prepared lesson | ✅ | pytest, Playwright |
| 4 | Start a 15-minute session | ✅ | pytest, Playwright |
| 5 | Hear Hindi instructions through the device | ✅ code path; ⚠️ audio not heard in testing | Sarvam TTS tested against mocked HTTP; device-voice fallback needs a phone with a Hindi voice |
| 6 | Submit a group answer by speech or manual input | ✅ manual; ⚠️ speech | Manual: Playwright. Speech: mocked Sarvam in pytest, plus one live Sarvam round trip on 31 Oct 2026 (synthesised "जवाब है पाँच।" → heard "जवाब है 5।" → parsed 5); real microphone, browser WAV and classroom noise untested |
| 7 | Get feedback and an adaptive next question | ✅ | 45 shared engine fixtures (Python + TS), pytest, Playwright |
| 8 | Continue when the network drops | ✅ | Playwright: download → offline → run → end → reconnect → sync |
| 9 | End and view a data-backed Hindi summary | ✅ | pytest (stats, grounding checks), Playwright |
| 10 | Review group progress and history | ✅ | pytest (analytics), screenshots |
| 11 | Sync offline records without duplication | ✅ | pytest (duplicate/idempotent), Vitest (queue), Playwright |
| 12 | Use the product on desktop and mobile | ✅ | Playwright mobile project (no horizontal scroll), screenshots at 390 px |

## Test results at hand-off

| Suite | Result |
|---|---|
| Backend pytest on SQLite | 93 passed |
| Backend pytest on PostgreSQL 16 | 93 passed |
| Alembic upgrade → check → downgrade on PostgreSQL 16 | passed |
| Ruff lint | clean |
| Frontend Vitest (engine fixtures, offline queue, WAV encoder, API client, components) | 64 passed (31 Oct 2026, after the UI redesign; see TESTING.md) |
| ESLint + TypeScript strict | clean |
| Production build (Vite + PWA) | passed; entry JS 123 kB, React 207 kB; 3D (917 kB) and charts (369 kB) load only when used |
| Playwright e2e (desktop + mobile) incl. axe accessibility | 6 passed (Chromium 153); offline test also passed 6/6 repeated |
| Docker images | **not built** — no Docker daemon in the build environment |

## Requires credentials or real-device validation

- **Claude API**: integration uses the Messages API with forced tool output, timeouts, bounded retries and a circuit breaker. Tested only against mocked responses. Verify the model names in `.env` are available on your account.
- **Sarvam Saaras (STT) and Bulbul (TTS)**: implemented from the public REST docs (endpoints `/speech-to-text`, `/text-to-speech`, header `api-subscription-key`). Tested only against mocked responses. Saaras returns no confidence score, so **every voice answer must be confirmed by a person before it is graded** — measure in a real classroom whether this is fast enough.
- **Noisy classroom speech**: chorus answers, Bluetooth speaker echo and microphone placement are untested. The parser rejects utterances with two different numbers rather than guessing.
- **Low-cost Android phones**: 3D is auto-disabled on ≤2 cores / ≤2 GB RAM / data saver; the 2D path was exercised, but performance on a real ₹8–10k phone was not measured.
- **Service worker on real devices**: offline runs were tested in headless Chromium. Test "Add to home screen" and offline launch on Android Chrome.
- **Lesson content**: 9 lessons / 135 questions were authored by the team and are labelled **draft** until a teacher reviews them in the app. Hindi wording should be checked by a primary teacher.

## Known limitations

- The teacher interface is in **Hindi by default with an English switch** (`हिं | EN`, remembered per device). The Hindi wording is a first draft by the team and still needs review by a Hindi-speaking primary teacher (`frontend/src/i18n/hi.ts`). Child-facing content is Hindi in both modes.
- Password reset by email is not implemented (no email service configured). An administrator can add teachers; account recovery is manual.
- Offline sessions record typed answers only; offline speech recognition would need an on-device model (not integrated, not promised).
- When the network drops mid-session and the teacher continues offline, the result is stored as two records (the interrupted online part and the offline continuation).
- Analytics are group-level only, by design.
- Legal compliance (DPDP Act and Rules, state policies) has **not** been reviewed. See PRIVACY.md.
