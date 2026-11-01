# BoltiToli · बोलती टोली — one-page summary

**AI for Foundational Learning Hackathon · Team Neural Cyphers**

## The problem

In a multigrade classroom one teacher works with children at several levels at once. While the teacher
helps one group, the other groups wait or do unsupervised work. Personalised practice for every group is
not possible with one adult in the room.

## Our solution

BoltiToli is a **Hindi voice helper that runs 15 minutes of guided maths practice with one group of
children**, so the teacher can give full attention to another group. One phone or laptop (optionally with a
Bluetooth speaker) serves the whole group.

1. The teacher picks a group and a skill (setup under a minute).
2. BoltiToli **asks in Hindi**, with the same question on screen and countable 3D/2D objects.
3. The group **answers together by voice**, or the group leader / teacher taps the number pad.
4. Wrong answers get a **hint**, then an **explanation and an easier question**; steady right answers get harder ones.
5. The teacher gets a **short Hindi summary**: what was practised, what was tricky, a suggested next activity.

> Technology supports the teacher; it never replaces the teacher. The teacher can repeat, skip, override or end at any time.

**Try it:** open the app and choose **Explore the demo school** — no sign-up needed.

## How it meets the judging criteria

| Criterion | What we built | Evidence |
|---|---|---|
| **Efficacy & user centricity (35%)** | One device helps a *group*, freeing the teacher. Hindi throughout the child-facing flow. Voice first: Sarvam Saaras listens, Sarvam Bulbul or the phone's own Hindi voice speaks. Works **offline** with downloaded lessons and syncs later without duplicates. Cheap phones get a 2D view automatically. | Live Sarvam check: spoke "जवाब है पाँच।", heard "जवाब है 5।", parser read 5 ([PROVIDERS.md](PROVIDERS.md)). Offline flow covered by an end-to-end test. Accessibility (axe) checked in CI. |
| **Innovation (25%)** | Most learning apps assume **one child per device**. BoltiToli is designed for a **group in a multigrade room**: chorus answers, a group leader role, and a teacher who stays in charge while teaching another group. Detects common mistake patterns (e.g. counting one too many/few, adding instead of subtracting) and reports them per group. | [ARCHITECTURE.md](ARCHITECTURE.md), lesson engine in `backend/app/lesson_engine/` |
| **Effective AI & technical strength (30%)** | AI is used where it is strong — **Hindi language**: Claude writes teacher summaries and kind explanations and drafts new questions; Sarvam handles Hindi speech. **Rules, not AI, decide** whether an answer is right and which question comes next. Guardrails: a summary is rejected if it contains any number not in the session data; spoken answers are confirmed by a person before grading; timeouts, retries, a circuit breaker and rule-based fallbacks keep a session running when a provider fails. | Live Claude check: summary 5.6 s (passed the number check), live explanation 2.4 s (inside a 4 s budget). 95 backend tests, 64 frontend tests, 6 browser end-to-end tests passing ([TESTING.md](TESTING.md)). |
| **Future roadmap (10%)** | Pilot, Hindi teacher interface, more skills and languages, reports for cluster/block officials, integration with state systems via UDISE codes. | [ROADMAP.md](ROADMAP.md) |

## Privacy and child safety

No children's names, photos or voice recordings are stored — groups have friendly names (e.g. "उड़ान"),
audio is discarded after transcription, and Claude receives only session counts, never group names.
See [PRIVACY.md](PRIVACY.md).

## Honest status

Working product, **not yet validated in a real classroom**. The 9 starter lessons (135 questions, Grades 1–3,
informed by NIPUN Bharat numeracy goals) are drafts until a teacher reviews them in the app. Real
classroom noise, chorus answers and low-cost phone performance are still to be tested. See [STATUS.md](STATUS.md)
and [USER-TESTING.md](USER-TESTING.md).
