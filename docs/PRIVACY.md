# Privacy, child safety and responsible AI

**This is a description of how the software is built, not legal advice.** Before real-world use,
review the Digital Personal Data Protection Act 2023 and the DPDP Rules in force, your state
education department's policies, and agree a consent process with the school (e.g. through the SMC).
BoltiToli does not claim legal compliance without that documented review.

## Data minimisation

| Stored | Not stored |
|---|---|
| Teacher accounts (name, email, password hash) | Children's names, photos, roll lists |
| School name, district, block, optional UDISE | Raw audio or voiceprints |
| Classrooms and **pseudonymous** learning groups (e.g. "उड़ान"), group size, optional leader label like "Roll 4" | Speech transcripts (only the parsed number is stored) |
| Per question: the group's numeric answer, how it was entered, outcome, detected mistake pattern | Individual-child performance |
| Session summaries and group-level progress | Advertising or profiling data |

- Spoken answers are recorded in the browser, sent once to the backend for transcription, and discarded.
- Logs contain request metadata only — never bodies, transcripts or audio.
- Claude receives only session statistics (counts, percentages, mistake labels) — not group names.
- A test (`test_no_child_audio_or_identity_columns`) guards the schema against audio/name columns.

## Access control

- Roles: `teacher`, `school_admin`, `official`. Teachers and admins see only their own school.
- Officials (CRC/block) see aggregated analytics only for schools explicitly granted via the CLI; they
  cannot open classrooms, groups or run sessions.
- Refresh tokens are httpOnly cookies, rotated on every use; reuse of an old token revokes all sessions.
- Administrative actions (staff added, lesson reviewed, consent recorded, data deleted, group level
  changed, etc.) are written to an audit log visible to school administrators.

## Consent and retention

- **Settings → Privacy and consent** records how the school authorised use and how parents were
  informed or consented, with reference and date, and can mark records revoked.
- Each school sets a retention period (90–3650 days, default 730). Administrators can delete expired
  records now, or **all** learning records for the school. Schedule `python -m app.cli apply-retention`.
- "Log out and clear this device" removes downloaded lessons and cached data from shared phones
  (unsynced sessions are kept so they are not lost).

## Responsible AI

- The deterministic engine alone decides correctness and the next question.
- Uncertain speech is never graded: without a provider confidence score, a person confirms what was heard.
- AI summaries are rejected if they mention numbers not present in the session statistics.
- AI-drafted questions are saved as drafts; answers are recomputed; a teacher must review before use.
- Level changes are suggestions with the evidence stated; the teacher decides.
- Feedback language is encouraging and group-focused; no child is labelled.

## Security

- Passwords: bcrypt (cost 12). Max 72 bytes, letters + numbers, ≥ 8 characters.
- Rate limits on auth and speech endpoints; uniform login errors to prevent account enumeration.
- Security headers (`nosniff`, `DENY` framing, referrer policy); CORS restricted to configured origins.
- Encryption in transit requires HTTPS at deployment; encryption at rest is provided by the database
  host — enable it.
