# Design direction: "the slate and the desk"

> **Redesign (31 Oct 2026).** The owner supplied a full mockup and asked for the UI to match it, with more 3D
> and motion everywhere. That deliberately reverses some earlier choices: a brighter navy/teal/orange palette,
> an orange accent line in the hero headline, and a speaker with glowing eyes (it used to be "LED lights, not a
> face"). Redesigned: tokens, landing page (all sections), app shell, dashboard, live session (incl. correct-answer
> celebration), summary, groups, classrooms, lessons, progress, login/register. Other pages pick up the new tokens,
> cards and animated page header but keep their old layout. Sections below describe the current code.

## Language

The teacher interface is **Hindi by default** with a `हिं | EN` switch (landing header, login, app top bar,
mobile menu, onboarding). The choice is stored in `localStorage` (`bt-lang`). How it works:
`frontend/src/i18n/I18nProvider.tsx` holds the language in React context and exposes `t(english, vars)`;
the English text is the key and `frontend/src/i18n/hi.ts` maps it to Hindi, falling back to English when a key
is missing. `<html lang>` follows the choice. Child-facing content (questions, hints, BoltiToli's phrases) is not
passed through `t()` and stays Hindi. Without the provider (unit tests) everything renders in English.

## Shared pieces added in the redesign

| Piece | File | What it does |
|---|---|---|
| `Reveal` | `components/ui/motion.tsx` | fades/rises content in the first time it scrolls into view |
| `TiltCard` | same | tilts toward the mouse in 3D with a soft glare; flat on touch screens and with reduced motion |
| `CountUp` | same | counts a number up once visible; screen readers get the final value |
| `KidPair`, `ToyBlocks`, `SchoolHouse`, `SpeakerBadge2D` | `components/illustrations/Cartoons.tsx` | inline-SVG / CSS cartoons (no downloads); `SpeakerBadge2D` is BoltiToli for 2D screens |
| `GroupProgressChart` | `components/charts/GroupProgressChart.tsx` | weekly first-try bars per group, level colours, gradient fills, staggered grow-in, glass tooltip, legend chips that hide/show a group, sr-only table |
| `TrendChart` | `components/charts/TrendChart.tsx` | weekly accuracy area chart; weeks without answers are gaps, never zeros |
| `LEVELS[level].color / .tint` | `lib/utils.ts` | the one place that maps a level to its colour |

Two physical objects from an Indian primary classroom carry the identity:

- **The slate** — an indigo chalkboard. The sidebar is a slate; every live question is written on a
  slate inside a wooden frame; the hero's chalkboard says `3 + 2 = ?`.
- **The desk** — warm natural wood, where countable things sit: apples, mangoes, balls, laddoos,
  leaves, counting sticks and tied bundles of ten. Every illustration shows exactly the quantities in
  the question, and moves only to show the arithmetic (groups slide together, removed items lift away).

## Tokens (`frontend/src/styles/index.css`)

| Token | Value | Use |
|---|---|---|
| slate-800 | `#16254A` | sidebar, question slate, primary text, "Get Started" button |
| chalk | `#F7F3EC` | page, chalk text |
| paper | `#FBF3E2` | exercise-book paper for summaries and lesson sheets (with a red margin line) |
| teal-600 | `#0F7F77` | primary actions |
| sky-100 / sky-600 | `#DCF0F7` / `#2280B8` | active navigation, info tiles |
| udaan / pragati / tarang | `#F28A1E` / `#3B8FE0` / `#1FA287` | one colour per group level, shared by cards and charts |
| wood-500 | `#B5804E` | frames, trays, progress blocks |
| saffron-500 / -600 / -700 | `#F28A1E` / `#D2650C` / `#A9500A` | speaking, current step, brand accent; use -600 for large text and -700 for small text (contrast) |
| success / warning / danger | `#1D7442` / `#8A5A07` / `#C0392B` | feedback states |

Radii: 8 px controls, 12 px inputs/buttons, 16 px cards, 20 px slates. Shadows are soft and deep
(`--shadow-card`, `--shadow-lift`); primary and slate buttons get a coloured glow and lift 1 px on hover.
`tile-3d` is a raised, lit-from-above icon chip used for feature and stat icons.

## Type

- **Mukta** (Ek Type) for everything — one family covering Devanagari and Latin, 400–800.
- **Kalam** for chalk-written moments only (lesson intro, offline chalk numbers, step numerals).
- Both self-hosted via Fontsource so they work offline.
- Hindi text uses a taller line-height (1.7). Numbers use tabular figures.

## Information devices

- **Tally marks** (| || |||) encode a group's level, borrowed from counting sticks.
- **Wooden block stack** on the summary: one block per question — solid (right first try), light
  (after a hint), outlined (more practice). It reports this session only and never claims mastery.
- Numbered steps appear only where the content is a sequence (session steps, onboarding, "how it works").

## 3D

- React Three Fiber + drei, procedural geometry and canvas-drawn textures only — no downloaded models,
  HDRIs or fonts.
- `ClassroomHeroScene`: BoltiToli (glossy navy speaker, glass face, two glowing cyan eyes, light strip
  at the base) on a classroom desk with three children (`Kid.tsx`, built from primitives), number blocks
  `3 + 2 =` that hop while it speaks, and a green board reading "आओ सीखें / 3 + 2 = ?" with chalk apples.
  Eyes blink when idle, pulse when speaking, open wide and turn white when listening. Glow is faked with
  additive soft-circle sprites (no post-processing package). Camera parallax ≤ 0.35 units; `shiftX` moves
  the scene right on wide screens so text can sit over its faded left edge (a CSS `mask-image`).
- Only one hero canvas is ever mounted (`useMediaQuery`), because a hidden canvas still costs a WebGL context.
- Every 3D scene is wrapped in `ThreeBoundary`: if the 3D chunk cannot load (offline — three.js is not
  precached) or WebGL fails, the 2D illustration shows instead.
- `CountingScene3D` renders on demand (no idle loop).
- Performance: lazy-loaded chunk, `dpr ≤ 1.75`, `powerPreference: low-power`, one baked contact shadow,
  rendering paused when off-screen or the tab is hidden, static frame with reduced motion.
- **Fallback**: devices with ≤ 2 CPU cores, ≤ 2 GB RAM, data-saver on, or no WebGL get the 2D SVG
  illustration. Teachers can force 2D in Settings → This device. 3D is never needed to run a lesson.

## Motion

| Moment | Motion | Duration |
|---|---|---|
| Button press | 1 px sink, shadow removed | 120 ms |
| Sidebar / dialog | slide / fade-scale | 200–220 ms, ease-out |
| Correct addition | objects slide into one counted group | spring, ~600 ms, then 700 ms pause |
| Subtraction reveal | removed objects lift and fade | 400 ms |
| Summary blocks | stacked one by one | 50 ms stagger |
| Speaking | saffron bars, only while audio plays | loop |
| Listening | bars driven by the real microphone level | live |

| Landing hero text | lines rise 14 px and fade in, staggered | 500 ms, 90 ms stagger |
| Landing scroll | hero text drifts up, 3D scene eases forward (parallax); sections reveal on scroll; steps connector draws itself | scroll-linked / 600 ms |
| Sidebar | active pill slides between items (`layoutId`) | spring |
| Page change | content fades up 8 px | 300 ms |
| Stat numbers | count up from 0 | 1.1 s |
| Live session | question blurs in; correct answer → confetti + star + "शाबाश!" (feedback held 1.4 s) | 1.6 s |
| Charts | bars grow in series by series; area lines draw in | 0.9–1.1 s |

All of it is disabled by `prefers-reduced-motion` (CSS rule for keyframes, `<MotionConfig reducedMotion="user">`
for framer-motion, and the 3D scenes render a still frame).

## Things deliberately avoided

Fake testimonials, invented statistics, "revolutionising education" copy, all-caps eyebrow labels, and
UI for features that do not exist yet (the mockup's Resources page, search, notifications and demo video
are left out until they are built). The mockup's orange headline line and the speaker's eyes were adopted
on purpose in the Oct 2026 redesign (see the note at the top).
