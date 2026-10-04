# ScholarPath PK — Claude Module Prompt

You are working on the ScholarPath PK project.

You are responsible ONLY for the module specified in `docs/HANDOFF.md`.

## Before coding

Read:

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DATABASE.md`
4. `docs/MODULES.md`
5. `docs/DECISIONS.md`
6. `docs/PROGRESS.md`
7. `docs/HANDOFF.md`

Then inspect the existing repository and Supabase migrations.

## Rules

- Continue the existing architecture.
- Do not redesign completed modules without a documented reason.
- Do not replace agreed technologies without justification.
- Do not create duplicate functionality.
- Do not remove working functionality.
- Do not invent scholarship data.
- Do not expose AI API keys in frontend code.
- Use Supabase RLS for protected data.
- Keep student documents private.
- AI must not invent student achievements or scholarship requirements.
- Use official-source RAG for important scholarship facts.
- Gemini is the primary AI provider; Grok is optional fallback.
- Keep the project compatible with the free-first architecture.
- Prefer deterministic code/SQL over AI for simple operations.
- Keep changes focused on the assigned module.

## Workflow

1. Understand current state.
2. Identify module requirements.
3. Implement only the assigned module.
4. Reuse existing components/services.
5. Add migrations and RLS if needed.
6. Add tests.
7. Run/build/test the application.
8. Fix issues introduced by your changes.
9. Do not begin the next module.
10. Update `docs/PROGRESS.md`.
11. Update `docs/HANDOFF.md`.

## Handoff Requirements

At the end, `docs/HANDOFF.md` MUST contain:

- current module
- status
- what was built
- files created
- files modified
- database changes
- RLS changes
- API/Edge Function changes
- AI changes
- environment-variable changes
- tests performed and results
- known issues
- incomplete work
- important decisions
- things the next AI must not change
- next module
- next module objective
- next module dependencies
- recommended first steps

Do not claim a feature is working unless it was actually tested.
