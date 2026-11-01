# Progress

What is done, what is in progress and what comes next. For the detailed validation status see
[STATUS.md](STATUS.md); for longer-term plans see [ROADMAP.md](ROADMAP.md).

*Last updated: 1 November 2026*

## Done

**Core product**
- Teacher accounts, schools, classrooms and learning groups, with roles and tenant isolation
- Deterministic lesson engine in Python and TypeScript, verified by shared fixtures
- 9 lessons and 135 questions for Grades 1 to 3
- Live and offline sessions with hints, explanations, adaptive difficulty and teacher overrides
- Offline lesson packs, saved audio and idempotent sync
- Dashboard, progress analytics, session summaries, CSV reports, consent and retention controls

**AI and voice**
- Claude summaries, live explanations and question drafting, verified with a real key (31 Oct 2026)
- Sarvam speech to text and text to speech, verified with a real key (31 Oct 2026)

**Interface**
- Full visual redesign with 3D scenes, motion and new charts (31 Oct 2026)
- Hindi-first teacher interface with an English switch (31 Oct 2026)
- Fixes found by testing: offline 3D crash, mobile overflow, slow first load, session frame rate, sidebar gap

**Security and readiness**
- Protected public demo school with a daily rebuild; rate limits on all costly actions (1 Nov 2026)
- Correct client IP for rate limiting behind proxies (1 Nov 2026)
- Repository prepared for GitHub: complete `.gitignore`, secret scan clean (1 Nov 2026)
- Hackathon documents: pitch, roadmap, user-testing script, decision log

**Deployment (1 Nov 2026)**
- Code on GitHub; live at https://boltitoli.vercel.app (Vercel), API on Render, PostgreSQL on Neon
- Verified live: health check and database, demo login, `/api` forwarding, security headers
- Rate limiting verified live: 11th demo login blocked through the website and across direct and website requests

## In progress

- Demo video for the hackathon submission

## Next

- Test with teachers and record findings in [USER-TESTING.md](USER-TESTING.md)
- Teacher review of the lesson wording and the Hindi interface text
- Voice testing with real microphones, children's voices and classroom noise
- Measure performance on a real low-cost Android phone
- Upgrade `zod` to version 4 (security advisory) as a separate, tested change

## Blocked or waiting

- PostgreSQL tests and Docker image builds locally: need Docker Desktop running
- Legal review against the DPDP Act and state policies: needs an external reviewer
