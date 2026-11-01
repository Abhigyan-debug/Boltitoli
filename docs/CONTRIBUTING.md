# Contributing to BoltiToli

Thank you for helping. BoltiToli is used with young children in real classrooms, so every change should
keep three promises: the teacher stays in control, no children's data is collected, and the core works
offline and without paid providers.

## Getting set up

Follow the [Quick start](README.md#quick-start) to run the backend (port 8000) and frontend (port 5173).
Provider keys are optional; leave them empty unless you are working on Claude or Sarvam features.

## Ways of working

1. **Open an issue first** for anything larger than a small fix, describing the problem and the proposed approach.
2. **Create a branch** from `main`: `feature/short-name`, `fix/short-name` or `docs/short-name`.
3. **Keep changes focused.** One concern per pull request; do not mix refactoring with behaviour changes.
4. **Follow the existing patterns** in the folder you are working in: naming, structure, error handling.

## Code standards

| Area | Rules |
|---|---|
| Backend | Thin routers in `app/api/v1`, logic in `app/services`. Errors use `AppError` subclasses. `ruff check .` must pass. |
| Frontend | TypeScript strict. Shared UI in `components/ui`, data hooks in `services/queries.ts`. `npm run lint` and `npm run typecheck` must pass. |
| Teacher-facing text | Wrap it in `t("English text")` and add the Hindi to `frontend/src/i18n/hi.ts`. Child-facing content stays Hindi and is not wrapped. |
| Lesson engine | Change Python and TypeScript together and regenerate `shared/engine-fixtures.json` (see [TESTING.md](TESTING.md#changing-engine-rules)). |
| Database | Every model change needs an Alembic migration: `alembic revision --autogenerate -m "describe change"`. |
| Accessibility | Keyboard reachable, labelled controls, sufficient contrast; animations must respect reduced motion. |
| Secrets | Never commit keys. They belong in `backend/.env`, which is git-ignored. |

## Tests

Add or update tests for every behaviour change, then run:

```bash
cd backend && pytest -q && ruff check .
cd frontend && npm run lint && npm run typecheck && npm test
```

Run the end-to-end suite for changes to user flows (`npx playwright test`; see [TESTING.md](TESTING.md) for
Windows notes). End-to-end runs must never use real provider keys.

## Pull request checklist

- [ ] The change is described: what, why, and how it was tested
- [ ] Tests added or updated, and all suites pass locally
- [ ] Teacher-facing text is translated in `hi.ts`
- [ ] No secrets, databases or generated files are included
- [ ] Documentation updated where behaviour changed (`STATUS.md`, `TESTING.md`, `decisions.md`)

## Reporting a security problem

Do not open a public issue for security vulnerabilities. Contact the team privately so the problem can be
fixed before it is disclosed.

## Code of conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
