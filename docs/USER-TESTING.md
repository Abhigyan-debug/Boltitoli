# User testing and refinement log

Proof that BoltiToli is shaped by the people who will use it. This file has two parts: a script for
testing with teachers, and a log of what we found and changed. Add an entry after every session.

## Part 1 — teacher test script (about 20 minutes)

**Before:** a phone or laptop with the app open on **Explore the demo school**, sound on. Ask permission to
take notes. Do not record children.

**Tasks** (let the teacher try first; note where they hesitate):

1. "Start a 15-minute session for the group Pragati." 
2. "Let the group answer the first question by voice." (Speak aloud mode; press **जवाब सुनें**.)
3. "Give a wrong answer on purpose. What does BoltiToli do?" (hint → explanation)
4. "Make the next question easier." (Teacher options → आसान सवाल)
5. "End the session and tell me what the summary says."
6. "Download a lesson and run it with the internet turned off."

**Questions afterwards:**

- Would you use this while teaching another group? What would stop you?
- Was the Hindi natural for your children? Any word you would change?
- Was anything confusing or slow?
- What is the one thing you would add or remove?
- On a scale of 1–5, how likely are you to try it in class next week?

**Record for each session:** date, teacher's role and grades taught (no names without consent), device,
internet quality, what worked, what confused them, exact quotes, and the 1–5 score.

## Part 2 — log

### Teacher sessions

| Date | Who (role, grades) | Device / network | Main findings | Change made | Status |
|---|---|---|---|---|---|
| — | No teacher sessions yet. First entry pending. | | | | |

### Internal testing (team, before teacher sessions)

These came from our own end-to-end and live testing, not from users. They show the refine-and-retest loop.

| Date | Found | Change made | Verified by |
|---|---|---|---|
| 31 Oct 2026 | Offline lesson crashed on devices that can show 3D (3D library not saved for offline) | 3D scenes fall back to 2D when they cannot load | Offline browser test passes in real Chrome |
| 31 Oct 2026 | Dashboard scrolled sideways on a 390 px phone | Cards shrink; only the sessions table scrolls | No horizontal scroll on 7 app pages at 390 px |
| 31 Oct 2026 | Claude summaries silently fell back to rules (newer models reject forced tool use) | Switched to structured JSON output | Live summary, explanation and drafting calls; summary page shows "Written by Claude" |
| 31 Oct 2026 | Backend crashed when `CORS_ORIGINS` was set in `.env` or Docker | Comma-separated origins parsed correctly | New test; backend starts with `.env` |
| 31 Oct 2026 | Correct-answer feedback disappeared too fast in text-only mode | Feedback and celebration held for 1.4 s | Measured on screen (~1.9 s visible) |
| 31 Oct 2026 | **Low-end phone simulation** (390 px, CPU 6× slower, Fast 3G): landing page blank for 6.6 s | Instant loading screen in `index.html`; slow connections (2G/3G) get the 2D illustration instead of downloading the 3D library | First visible content 6.6 s → 2.5 s; landing download 711 KB → 340 KB |
| 31 Oct 2026 | Same simulation: live-session screen at 21 fps (3D desk redrew every frame although the speaker is hidden on phones) | Redraw every frame only while the speaker is visible (wide screens); otherwise only when something moves | 21 → 38 fps |
| 31 Oct 2026 | **Persona walk-through** (Hindi-first teacher on a small phone): group name cut to "उ…" in the live-session header | Timer shows just the elapsed time on phones | Header shows "उड़ान, 10 तक चीज़ें गिनना" at 390 px |
| 31 Oct 2026 | Local e2e runs used the real keys from `backend/.env` (7 Sarvam audio clips generated) | Test servers now start with empty `ANTHROPIC_API_KEY` / `SARVAM_API_KEY` | Re-run: 6/6 pass, no new provider calls |

### Measured on the low-end phone profile (after fixes)

| Step | Time |
|---|---|
| Landing: first visible content | 2.5 s |
| Login page | 0.3 s first paint |
| Demo login → dashboard with data | ~3 s |
| Progress page → first chart | ~6 s (charts library download; not yet optimised) |
| Prepare → session ready / Start → question / Answer → feedback | 2.1 s / 0.7 s / 1.2 s |
| Session screen smoothness | 38 fps |

A simulation is not a real ₹8–10k phone: GPU speed and real network behaviour are not covered.
