# Technical decisions

A record of the important choices behind BoltiToli: the context, the decision, the reasons and the
alternatives considered. Newest decisions are at the bottom. Each entry is short so that it stays read.

| # | Decision | Date |
|---|---|---|
| 1 | Rules decide correctness; AI only explains and summarises | initial build |
| 2 | One device per group, not per child | initial build |
| 3 | Lesson engine implemented twice, verified by shared fixtures | initial build |
| 4 | Offline-first progressive web app | initial build |
| 5 | Claude and Sarvam are optional providers with fallbacks | initial build |
| 6 | No children's personal data | initial build |
| 7 | Structured outputs instead of forced tool use for Claude | 31 Oct 2026 |
| 8 | 3D is decoration, never required | 31 Oct 2026 |
| 9 | Hindi-first teacher interface with English text as translation keys | 31 Oct 2026 |
| 10 | Protect the shared public demo school | 1 Nov 2026 |
| 11 | Rate-limit key read from the right of X-Forwarded-For | 1 Nov 2026 |
| 12 | Vercel + Render + Neon as the free hosting setup | 1 Nov 2026 |

---

### 1. Rules decide correctness; AI only explains and summarises
**Context.** Children must get consistent, correct feedback, and teachers must be able to trust it.
**Decision.** A deterministic lesson engine grades answers, gives hints and picks the next question. Claude
writes summaries and explanations only, and a summary is rejected if it contains any number not in the session data.
**Why.** Predictable, testable, works offline and costs nothing per answer.
**Alternatives.** Letting a language model grade and choose questions: rejected as unpredictable and impossible to verify.

### 2. One device per group, not per child
**Context.** Multigrade schools rarely have one device per child, and the teacher needs to work with another group.
**Decision.** A session serves a whole group; answers are the group's answer, entered by voice, the group leader or the teacher.
**Why.** Matches real classroom resources and keeps the teacher in charge.
**Alternatives.** Individual child accounts: rejected for cost, privacy and classroom practicality.

### 3. Lesson engine implemented twice, verified by shared fixtures
**Context.** Sessions must run identically online (server) and offline (phone).
**Decision.** Python and TypeScript implementations must both pass `shared/engine-fixtures.json`.
**Why.** Offline sessions behave exactly like online ones, and drift between the two is caught by tests.
**Alternatives.** Running Python in the browser or keeping offline logic on the server only: rejected as heavy or not offline.

### 4. Offline-first progressive web app
**Context.** School internet is patchy or absent.
**Decision.** A PWA with a service worker, lessons and audio saved in IndexedDB, and idempotent sync of offline sessions.
**Why.** Installs from the browser, no app store, works on low-cost Android phones.
**Alternatives.** A native Android app: higher build and distribution cost for a first version.

### 5. Claude and Sarvam are optional providers with fallbacks
**Context.** Paid services may be unavailable, slow or not configured.
**Decision.** Every provider call has timeouts, bounded retries, a circuit breaker and a non-AI fallback
(rule-based summary, phone voice, number pad).
**Why.** A session never stops because a provider failed.
**Alternatives.** Making the providers mandatory: rejected; the product must work for schools without budgets.

### 6. No children's personal data
**Context.** The users include children aged 6 to 9.
**Decision.** Groups have friendly names; audio is transcribed once and discarded; Claude receives only counts.
A test guards the schema against audio or name columns.
**Why.** Data minimisation lowers risk and makes adoption easier for schools.
**Alternatives.** Per-child tracking: rejected for privacy and consent reasons.

### 7. Structured outputs instead of forced tool use for Claude
**Context.** A live test showed Claude Sonnet 5.5 and Haiku 5.5 reject forced `tool_choice`, so every AI feature
silently fell back to rules.
**Decision.** Request JSON with `output_config.format` (JSON schema, every object closed) and low effort.
**Why.** It is the current supported way to get guaranteed JSON, and the callers did not need to change.
**Alternatives.** `tool_choice: auto` with prompt instructions: no guarantee the tool is called.

### 8. 3D is decoration, never required
**Context.** The redesign added 3D scenes, but the 3D library is not cached for offline use and low-end phones struggle.
**Decision.** Every 3D scene sits behind an error boundary that falls back to 2D; low-end devices and slow
networks get 2D automatically; a teacher can force 2D in Settings.
**Why.** A lesson must never fail because of graphics.
**Alternatives.** Caching the 3D library offline: adds about 245 KB compressed to every offline download.

### 9. Hindi-first teacher interface with English text as translation keys
**Context.** Many teachers prefer Hindi; the dashboard was English only.
**Decision.** A small in-house i18n layer: `t("English text")` looks up Hindi in `hi.ts` and falls back to English.
Hindi is the default; the choice is stored per device.
**Why.** Two languages and simple strings do not justify a library; code stays readable in English.
**Alternatives.** `react-i18next` with key-based dictionaries: more setup and a new dependency for no extra benefit here.

### 10. Protect the shared public demo school
**Context.** Every visitor shares one demo school and was its administrator, so anyone could delete records,
add accounts or change the shared lesson library.
**Decision.** A `_not_demo` guard blocks destructive and shared-data actions in the demo, and the demo is rebuilt
when it is older than 24 hours.
**Why.** Judges can explore safely, and one visitor cannot spoil the demo for the next.
**Alternatives.** A separate demo school per visitor: more data and more database growth.

### 11. Rate-limit key read from the right of X-Forwarded-For
**Context.** The server trusted the first `X-Forwarded-For` entry, which a client can forge to bypass rate limits.
**Decision.** Use the entry `TRUSTED_PROXY_HOPS` from the right, which our own proxy wrote.
**Why.** It cannot be forged through the intended path; the value is confirmed after deployment.
**Alternatives.** Trusting all proxy headers: bypassable. Ignoring them: every visitor would share one limit.

### 12. Vercel + Render + Neon as the free hosting setup
**Context.** The hackathon needs a public link at no cost.
**Decision.** Frontend on Vercel (forwarding `/api` to the backend), backend container on Render, PostgreSQL on Neon.
**Why.** Free tiers, HTTPS by default, deploys from GitHub; Neon's free database does not expire.
**Alternatives.** Railway (simpler, about USD 5 a month, no sleeping) and a single virtual machine (more maintenance).
**Trade-off.** Render's free backend sleeps after about 15 minutes idle; the first request then takes about 50 seconds.
