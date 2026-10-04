# ScholarPath PK

## Project Starter Documentation

ScholarPath PK is a free-first AI-powered platform for Pakistani students who want to find, prepare for, apply to, and track international scholarships.

The project is intentionally developed **module by module** so different AI coding sessions (Claude, Gemini, ChatGPT, Cursor, etc.) can continue the work without needing the previous conversation.

## Core Product

Student journey:

Create profile → Upload documents → Find scholarships → Check eligibility → Ask AI using official sources → Get roadmap → Prepare SOP/essays/research proposal → Get application assistance → Final review → Apply on official portal → Track application → Scholarship secured → Become mentor

## Main User Roles

- **Guest:** public pages only
- **Student:** personal profile, documents, scholarships, AI, applications
- **Mentor:** student features + verified scholar stories and guidance
- **Admin:** manage scholarship data, sources, RAG, mentors, moderation and system settings

## Technology

- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase Edge Functions
- pgvector for RAG
- Gemini as primary AI provider
- Grok as optional fallback provider
- Vercel deployment
- GitHub source control

## Development Rule

One AI session should work on **one module only**. At the end it must update `docs/HANDOFF.md` and `docs/PROGRESS.md`.

Read the following before coding:

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. `docs/DATABASE.md`
4. `docs/MODULES.md`
5. `docs/DECISIONS.md`
6. `docs/PROGRESS.md`
7. `docs/HANDOFF.md`

Do not redesign completed modules without a documented reason.
