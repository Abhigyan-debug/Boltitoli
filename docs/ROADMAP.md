# Roadmap

Where BoltiToli goes after the hackathon, and how it fits into systems schools already use.
Everything below the "Today" section is **planned, not built**.

## Today (31 Oct 2026)

- Guided 15-minute Hindi maths sessions for one group, with voice in and out, hints, explanations and adaptive difficulty.
- 9 skills / 9 lessons / 135 questions for Grades 1–3 (counting to 10 up to two-digit addition), drafts until teacher-reviewed.
- Teacher dashboard, group progress, Hindi summaries (Claude), offline lessons with later sync.
- Roles for teachers, school admins and cluster/block officials (officials see only aggregates, only for schools granted to them).

## Phase 1 — pilot-ready (next 4–6 weeks)

| Goal | Why |
|---|---|
| **Classroom pilot with 2–3 teachers** using the test script in [USER-TESTING.md](USER-TESTING.md) | The single most important missing piece: evidence from real classrooms |
| Teachers review the Hindi wording of all 9 lessons in the app | Lessons are drafts until a primary teacher approves them |
| Test voice with real phones, the browser's WAV recordings, chorus answers and classroom noise | Speech has so far been checked only with synthesised audio |
| Measure speed on a ₹8–10k Android phone; test "Add to home screen" and offline launch | The target device class |
| Teacher review of the Hindi interface wording (Hindi is the default since 31 Oct 2026, with an English switch) | The translations are a team draft |
| Password reset, consent process with the school (SMC) and a DPDP Act review | Required before real-world use |

**Pilot measures** (to be collected, not claimed): sessions per group per week, minutes the teacher spent
with another group, change in first-try accuracy per skill, how often spoken answers needed a retry or correction,
teacher satisfaction.

## Phase 2 — broaden (2–4 months)

- **More skills** to cover the Grade 1–3 numeracy goals end to end, then early literacy (letter sounds, reading short words) using the same group-session format.
- **More languages.** The Hindi number parser and recorded phrases are the language-specific parts; other Indian languages need their own parser rules, phrases and a teacher review. Speech providers must be checked per language.
- **Teacher-made questions** with AI drafting (already built) plus a stronger review flow, so content can grow locally.
- **Offline speech recognition** research with an on-device model, so voice also works without internet.
- **Alternative speech providers** (e.g. open-source Indian-language models) behind the existing `SpeechToTextService` interface, to reduce cost.

## Phase 3 — integrate into existing systems

| Integration | Starting point that already exists |
|---|---|
| State school records | Schools can store their **UDISE code** |
| Cluster/block monitoring (CRC/BRC) | **Official** role with explicit, audited access to aggregates; CSV export of sessions |
| Curriculum goals | Each skill carries **curriculum references** (informed by NIPUN Bharat); map them to state learning-outcome codes |
| State content platforms | Lessons are versioned JSON packs; an importer/exporter could exchange content with state platforms (to be explored with the department) |
| Hosting | Runs with Docker and PostgreSQL; can be hosted on government cloud infrastructure for data residency |

## Risks and dependencies

- Speech recognition quality with many children speaking at once is unknown until tested.
- Speech and AI services cost money per use; offline audio packs and rule-based fallbacks keep the core working without them.
- Adoption depends on teacher trust: the teacher must always stay in control, and the product must save time, not add work.
