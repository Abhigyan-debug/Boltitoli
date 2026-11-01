# Learning log

What was built, why, and the concepts behind each piece. Entries are grouped by topic; each lists the key
files so you can read the code alongside the explanation.

## 1. Error boundaries: keeping a lesson alive when 3D fails

**Problem.** Offline, the 3D scene's library could not load and the whole lesson crashed.
**Concept.** `<Suspense>` shows a fallback only *while* something loads. To handle a load that *fails*, React
needs an **error boundary**, a class component with `getDerivedStateFromError` that renders a fallback instead
of crashing.
**Files.** `frontend/src/components/three/ThreeBoundary.tsx`, `QuestionVisual.tsx`.

## 2. Design tokens and the visual redesign

**Concept.** A design token is a named value such as `--color-teal-600`. Components use the name, so changing
one value restyles the whole app. The redesign mostly changed token values in one file.
**Files.** `frontend/src/styles/index.css`, `docs/DESIGN.md`.

## 3. 3D with React Three Fiber

**Concepts.**
- `useFrame` runs code every frame; `Math.sin(time)` gives smooth back-and-forth motion (bobbing, blinking).
- Fake bloom: a soft round gradient drawn with additive blending makes things look like they glow without extra libraries.
- `frameloop="demand"` redraws only when something changes, saving battery; the session screen switches to every frame only when the animated speaker is visible.
**Files.** `frontend/src/components/three/*`.

## 4. Motion and interaction

**Concepts.** `whileInView` starts an animation when an element scrolls into view; springs make a 3D tilt feel
physical; a shared `layoutId` makes the sidebar highlight slide between items; `MotionConfig reducedMotion="user"`
respects the device's reduced-motion setting.
**Files.** `frontend/src/components/ui/motion.tsx`, `components/layout/AppShell.tsx`.

## 5. Structured outputs from Claude

**Problem.** Newer models reject forced tool use, so AI features silently fell back to rules.
**Concept.** Structured outputs (`output_config.format`) make the model reply with JSON matching a schema; every
object needs `additionalProperties: false`. Thinking tokens count toward `max_tokens`, so leave headroom.
**Files.** `backend/app/ai/claude_client.py`, `backend/tests/test_providers.py`.

## 6. Configuration and environment files

**Problem.** The backend crashed when `CORS_ORIGINS` came from `.env`.
**Concept.** pydantic-settings JSON-decodes list fields before validators run; marking the field `NoDecode` passes
the raw text to the comma-splitting validator.
**Files.** `backend/app/core/config.py`.

## 7. Performance on low-end phones

**Concepts.** Measure first: CPU throttling and network emulation in Chrome showed a 6.6 s blank screen. An inline
splash in `index.html` paints immediately because it needs no JavaScript; choosing 2D on slow networks avoids a large download.
**Files.** `frontend/index.html`, `frontend/src/components/three/capability.ts`.

## 8. CSS layout pitfalls

**Concepts.**
- Grid items default to `min-width: auto` and refuse to shrink below their content; `min-w-0` lets a card shrink so only its table scrolls.
- Tables ignore the 1-pixel size of `sr-only`; hidden tables must sit inside an `sr-only` div, or they stretch the page.
**Files.** `frontend/src/features/dashboard/OverviewPage.tsx`, `components/charts/*`.

## 9. Internationalisation

**Concept.** React Context stores the language; `t("English text")` looks up Hindi in a dictionary and falls back to
English. Hooks such as `useCallback` must list `t` as a dependency, or they keep the old language.
**Files.** `frontend/src/i18n/*`, `components/ui/LanguageToggle.tsx`.

## 10. Security for a public demo

**Concepts.**
- A FastAPI dependency can wrap another (`_not_demo(admin)`) to add a rule to many endpoints at once.
- Proxies append to `X-Forwarded-For`; only entries written by your own proxies can be trusted.
- Deleting with SQL lets the database's `ON DELETE CASCADE` remove related rows; tests must enable foreign keys in SQLite to prove it.
**Files.** `backend/app/api/deps.py`, `backend/app/core/rate_limit.py`, `backend/app/cli.py`, `backend/tests/test_demo_security.py`.

## 11. Git hygiene

**Concepts.** `.gitignore` keeps secrets (`.env`, `.env.*`), databases, build output and caches out of the
repository. Scan the files to be committed for keys before the first push.
**Files.** `.gitignore`.
