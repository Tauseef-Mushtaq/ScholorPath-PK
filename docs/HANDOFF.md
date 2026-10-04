# ScholarPath PK — AI Session Handoff

> Updated at the end of every development session. The next AI must read it before coding.
> Module 18 is first (final module in the roadmap), then Module 17, 16…

## Module 18 — Admin + Production Hardening (2026-10-03) — latest entry
### Scope (MODULES.md / FR-027)
Admin dashboard, moderation (reports), scholarship/source/RAG visibility, users list, audit log, security headers, health checks.

### Implemented
- Migration `20261003000500_reports_and_hardening.sql` (`reports` + RLS + indexes)
- `src/lib/admin/`: constants, types, validation, queries, actions (`submitReport`, `updateReportStatus`, `logAdminAction`)
- Pages: `/admin` (stats), `/admin/users`, `/admin/reports`, `/admin/sources`, `/admin/rag`, `/admin/audit`, `/admin/settings`
- Shared `AdminNav`; report form component for students
- Security headers in `next.config.ts`; `/api/health` boolean flags only
- Tests: `tests/admin/` (validation 6, static 32); `npm run test:admin`
- ADR-042

### Security
`requireRole(["admin"])` on all admin pages; session client only; reporters can only insert own open reports; admin-only status updates audited; no service role; no secret leakage in health/settings UI.

### Not in this module
Deploy CI/CD scripts; virus scanning; full source CRUD UI (still via scholarship editor); live verification; automatic role elevation UI.

### Tests observed
validation 6 pass; static 32 pass. Live DB/browser: **BLOCKED**.

### Next
Owner: apply reports migration; open `/admin` as admin; file a report as student; resolve it; confirm audit row. Roadmap modules 01–18 are implemented at least partially — remaining work is live verification and production deploy.

---

## Module 17 — Mentor Community (2026-10-03)
### Scope (MODULES.md / FR-025–FR-026)
Mentor application, admin verification, stories, timelines, Q&A; public mentor list and profiles. Content labeled personal experience, not official requirements.

### Implemented
- Migration `20261003000400_mentor_community.sql`: `mentor_stories`, `mentor_timelines`, `mentor_questions`, `mentor_answers`; helpers `owns_mentor`, `is_verified_mentor`; admin update on `mentors.verification_status` / `verified_at`
- `src/lib/mentors/`: constants, types, validation, queries, actions
- UI: `/mentor/apply`, `/mentor/dashboard`, `/admin/mentors`, updated `/mentors`, `/mentors/[id]`
- Forms: apply, story, timeline, ask, answer, admin verify
- Tests: `tests/mentors/` (validation 10, static 31); `npm run test:mentors`
- ADR-041

### Security
Session identity for apply/own content; verified-only writes for stories/timelines/answers; public read of published content; admin-only verification status changes; no client role self-grant; no service role in app paths; personal-experience disclaimers in UI.

### Not in this module
Full admin moderation/reports UI (Module 18); automatic `profiles.role` elevation (still service-role `set_user_role`); mentor matching algorithm; live verification.


### Hotfix (PGRST200 on /mentors)
`loadVerifiedMentors` / `loadVerifiedMentorById` / `loadPublishedStoriesRecent` no longer use nested PostgREST embeds (`countries(name)`, `mentor_stories(...)`). Those caused **PGRST200** when the schema cache lacked a relationship (e.g. Module 17 migration not applied yet, or ambiguous FK). Related names and story counts are loaded with separate flat selects; missing community tables return empty lists instead of failing the page.

### Tests observed
validation 10 pass; static 31 pass. Live DB/browser: **BLOCKED**.

### Next
Owner: apply migration; student applies; admin verifies at `/admin/mentors`; mentor publishes story; guest sees it on `/mentors`. Then Module 18 Admin + Production Hardening.

---

## Module 16 — Application Review (2026-10-03)
### Scope (MODULES.md / FR-022–FR-023)
Consistency checker (profile vs drafts heuristics), completeness (profile, documents by type, writing drafts, tasks), deadline status, eligibility from Module 09 engine, and a single application health summary on the application detail page.

### Implemented
- `src/lib/review/`: constants, types, completeness, consistency (GPA/field/experience heuristics), deadline, eligibility-items, health aggregator, index, service.server
- UI: `ReviewPanel` on `/applications/[id]` (overall ready/needs_work/not_ready, score, grouped findings)
- No migration (computed on demand from existing tables)
- Tests: `tests/review/` (validation 16, security-static 44); `npm run test:review`
- ADR-040 in DECISIONS.md

### Security
Session identity only for own profile/documents/drafts/tasks; public anon client only for active scholarship eligibility read; no service role; pure engine has no env/AI; UI disclaims auto-submit.

### Not in this module
`application_documents` linking; document content analysis; mentor community (Module 17); storing review snapshots; live verification.

### Tests observed
validation 16 pass; static 44 pass. Live DB/browser: **BLOCKED** (same sandbox limits as prior modules).

### Next
Owner: open an application as Student A with profile + drafts + docs; confirm health panel reflects data; Student B cannot see A's application. Then Module 17 Mentor Community.

---

## Module 15 — Application Copilot (2026-10-03)
### Scope (MODULES.md / FR-018–FR-021)
SOP, essays, motivation letter, research proposal, CV summary, and application-question assistance — drafts grounded in the student's own profile + one scholarship. No invented achievements.

### Implemented
- Migration `20261003000300_application_drafts.sql` (table + RLS via `owns_application`)
- `src/lib/copilot/`: constants, types, validation, prompt, generation (Gemini text), service.server, queries, actions
- API: `POST /api/copilot/draft` (session + origin check)
- UI: `CopilotPanel` on `/applications/[id]` — generate/revise, save versions, approve, delete
- Scholarship card badge overflow fix: long `field` text wraps (`whitespace-normal break-words`) inside the card
- Tests: `tests/copilot/` (validation 9, security-static 21); `npm run test:copilot`
- ADR-039 in DECISIONS.md

### Security
Session identity only; ownership through applications.user_id + RLS; no service role on client paths; API key only server-side; prompt neutralises control tags; model instructed never to invent facts.

### Not in this module
Consistency checker / final review (Module 16); linking vault documents to applications (`application_documents`); live Gemini verification.

### Tests observed
validation 9 pass; static 21 pass. Live DB/Gemini/browser: **BLOCKED** (same sandbox limits as prior modules).

### Next
Owner: apply migration; live-generate a draft as Student A; confirm Student B cannot read A's drafts; then Module 16 Application Review.

## Module 14 — Application Workspace (2026-10-03)
### Scope (MODULES.md / FR-017)
Applications, tasks, notes, statuses, timelines and deadlines — student-owned workspace UI on existing tables.

### Implemented
- `src/lib/applications/`: constants, types, validation, queries, actions, format
- Pages: `/applications`, `/applications/[id]` (+ loading, not-found)
- Components: application-card, workspace-forms (status/notes/tasks), start-application-button
- Scholarship detail: "Track in my workspace" when signed in
- Header + dashboard links
- ADR-037 in DECISIONS.md
- Tests: `tests/applications/` (validation 6, static 8); `npm run test:applications`

### Security
Session identity only; RLS + `user_id` filters; no service role; allow-listed writes; other users' applications → not found.

### Not in this module
application_documents linking, draft writing (Module 15), review (Module 16), admin app views.

### Tests observed
validation 6 pass; static 8 pass. Live DB/browser: **BLOCKED**.

### Next
Owner: live check create/list/detail/status/task as two students. Then Module 15 Application Copilot.

## Repair Session 8 — prepare-flow integration + honesty gate (2026-10-03) 
### Goal
Confirm "Prepare me for this scholarship" is wired end-to-end and report what is actually verified. **Do not start Module 14.**

### Integration trace (code — connected)
```
scholarshipId / search → getScholarship
→ getStudentProfile (Repair 5)
→ getStudentDocuments (metadata)
→ checkEligibility (Module 09 engine)
→ searchRag (Module 11 retrieve, Repair 7 scope)
→ deriveGaps (profile + document coverage Repair 6 + requirements)
→ createTask candidates (LOW_RISK L2)
→ createRoadmap / updateRoadmap (update = APPROVAL_REQUIRED)
→ nextAction + report
```
Route: `POST /api/agent/run` (session user only, origin required). Panel: client posts goal + scholarshipId only.

### Fixed this session
1. **Security regression:** `decideToolCall` was missing `if (def.risk === "FORBIDDEN") return forbidden_tool` — restored. Forbidden tools are rejected before autonomy/input/approval.
2. Static tests: RAG uses `chunkBelongsToScholarship`; matching migration pin ignores `match_knowledge_*` filename.

### Verified locally (unit/static only)
agent 66 + documents 18 + discovery 33 + static 29; knowledge 61 + static 19; assistant 26 + static 16; matching 55 + scenarios 22 + static 26.

### BLOCKED — not live-verified
Real Supabase, real Gemini, browser, Student A/B isolation, ingested RAG corpus, `test:db`, full project lint/typecheck/build, approval on live API.

### Module 13 status
**PARTIALLY_COMPLETE.** Not COMPLETE. Contradictory "NOT_STARTED" row removed from PROGRESS.md.

### Owner live checklist (before Module 14)
1. Publish a scholarship; sign in as Student A (profile + CV + transcript, no degree cert).
2. Open that scholarship → "Prepare me for this scholarship."
3. Expect: eligibility, missing degree certificate, tasks, roadmap, next action — no other student's data.
4. Repeat as Student B with different profile — independent tasks/roadmap.
5. With ingested sources: RAG excerpts only for that scholarship; without: empty evidence, still completes gaps/tasks.
6. Decline/approve an updateRoadmap when a roadmap already exists.

### Do not
- Start Module 14 until the live checklist is done (or the owner explicitly accepts BLOCKED items).
- Claim RAG or Gemini "works" from unit tests alone.

## Repair Session 7 — scholarship-scoped RAG evidence actually reaches assistant/agent (2026-10-03)
### What was wrong (code path)
1. `match_knowledge_chunks` **filtered** by `scholarship_sources → scholarships sc.id` but **returned** `knowledge_documents.scholarship_id`, which is **nullable**. When that column was null (or drifted), Module 12/13 defence-in-depth (`chunk.scholarshipId === requestedId`) dropped **every** row → empty evidence even though SQL found the right chunks.
2. Scholarship id comparison was case-sensitive string equality; PostgREST/DB can return mixed case while validators lower-case inputs.
3. `retrieveKnowledge` itself did not re-apply scholarship scope after mapping — only each consumer did, inconsistently.

Operational (not fixed in code): empty knowledge base if sources were never ingested, or Gemini embeddings unavailable — those still yield empty/insufficient by design.

### Changed
- NEW migration `20261003000200_match_knowledge_scholarship_id.sql`: `match_knowledge_chunks` returns `sc.id` as `scholarship_id` (same id the WHERE clause uses). Grants/access model unchanged.
- `src/lib/knowledge/retrieve.ts`: `normalizeScholarshipId`, `chunkBelongsToScholarship`; `mapMatchRow` lower-cases scholarship id; `retrieveKnowledge` re-filters by scholarship when a filter was requested.
- `src/lib/assistant/answer.ts` + `src/lib/agent/executors.server.ts`: use `chunkBelongsToScholarship` (still Module 11 only — no second RAG).
- `src/lib/agent/state.ts`: `setScholarship` lower-cases id for policy scope checks.
- Not touched: public search, matching, profile, application workspace, ingestion pipeline logic, embedding model, second vector store.

### Tests (local sandbox)
| Check | Result |
|---|---|
| knowledge unit | **61 pass** (incl. scope: other/null ids dropped, case-insensitive keep) |
| assistant unit | **26 pass** |
| agent unit | **66 pass** + documents 18 |
| knowledge static | **19 pass** (+ migration returns sc.id) |
| assistant static | **16 pass** |
| documents/search/details static (migration list) | pass |
| Live pgvector / Gemini / ingested corpus | **BLOCKED** (no Postgres+pgvector, no API keys). Do **not** claim RAG works end-to-end from unit tests alone. |

### BLOCKED / live proof required
- Apply migrations including `20261003000200` on a DB with pgvector.
- Ensure scholarship sources are **active**, **last_verified_at set**, scholarship **active**, then run admin ingest until `knowledge_documents.processing_status = ready`.
- Ask the assistant a question on scholarship A; confirm citations only from A. Repeat with B — no A text.
- Agent `searchRag` for A must not return B excerpts.
- Without ingested chunks, expect **insufficient** / empty evidence (correct, not a regression).

### Next AI
- Do not invent a second retrieval path.
- If live still returns empty after ingest, check embedding key, vector(768) match, and source eligibility (`last_verified_at`, active flags) before changing retrieval code again.

## Repair Session 6 — document requirements vs vault metadata (2026-10-03)
### What was wrong
1. `deriveGaps` listed every required scholarship row as "Confirm you can meet: …" and never compared them to the student's vault.
2. `stateDigest` only said `documents on file: N` — no types, no present/missing.
3. `analyzeDocument` correctly returned `analysis_not_supported` (no extraction pipeline exists), but the agent still could not answer "do I have a CV / transcript?".
4. There is **no** `scholarship_documents` table; required documents are ordinary `scholarship_requirements` rows (often `requirement_type = 'document'`). Vault categories live in `documents.document_type` (app list in `DOCUMENT_TYPES`).

### What the system actually has (no invention)
- Student vault: `documents` rows with `document_type` ∈ {passport, transcript, degree_certificate, cv, english_test, recommendation_letter, statement_of_purpose, other} (nullable free text in DDL; app-restricted).
- Scholarship side: `scholarship_requirements` with `requirement_type`, `title`, `required`. Document needs are either `type = document` or a title that maps to a vault category.
- **No** content extraction, OCR, or `extracted_text_reference` pipeline. Contents are never claimed to have been read.

### Changed
- NEW pure `src/lib/agent/documents.ts`: `mapTitleToVaultType`, `isDocumentRequirement`, `documentCoverage`, `documentGaps`, `documentDigest`. Deterministic keyword mapping only; unknown titles stay unmapped (confirm-yourself path).
- `report.ts#deriveGaps`: uses coverage → `Missing document: {label}` (where: documents) for mapped missing required types; non-document required rows stay "Confirm you can meet". Empty vault / list-unavailable messages unchanged.
- `taskCandidates` / `roadmapSteps`: specific "Upload: {label}" tasks for missing mapped categories; present matches are not re-tasked.
- `model.ts#stateDigest`: includes `documentDigest` (types on file + present/missing lines). Never claims analysis.
- `index.ts`: re-exports documents module.
- `analyzeDocument` / `getStudentDocuments` executors **unchanged** (ownership filter + `analysis_not_supported`).
- Not touched: RLS, migrations, matching, profile tool, client UI, Module 14, any extraction pipeline. No dependency added.

### Tests (observed this session, local sandbox)
| Check | Result |
|---|---|
| `tests/agent` unit | **66 pass** |
| NEW `tests/agent/documents.test.cjs` | **18 pass**: map titles, present/missing (CV+Transcript vs Degree Certificate), duplicates, unknown vault type, unmapped requirement, empty vault, null list, optional, no requirements, non-document rows, deriveGaps integration, digest never claims content, analyzeDocument still unsupported |
| discovery 33; static **29** (+1 document-requirements check) | pass |
| `tests/documents` static 22 | pass |
| Live Supabase / two-student document isolation | **BLOCKED** (no credentials); ownership already enforced in executors + prior static checks |

### BLOCKED / not proven
- Real Supabase document rows for two students: not run. Isolation relies on existing `user_id` filters + RLS (same as Session 5).
- `npm ci` / full typecheck / lint / build: not run (no project `node_modules`). Pure modules compiled with standalone `tsc --strict`.
- No real Gemini call: the model is *given* the coverage lines; live wording untested.
- Title→category mapping is a fixed keyword list; exotic requirement wording that does not match stays "confirm yourself" (intentional).

### Live check to run (owner)
1. Upload a CV + Transcript for student A; leave Degree Certificate out.
2. Prepare a scholarship whose requirements include those three (type `document` or clear titles).
3. Confirm the report: CV present, Transcript present, Degree Certificate missing — and that the agent never claims to have read file contents.
4. Attempt `analyzeDocument` with student B's document id under student A's session → `not_found` / no data.

### Next AI
- Do **not** invent a content-extraction pipeline unless the product adds secure infrastructure first.
- If `scholarship_documents` is added later, map coverage through that table; keep metadata-only checking until extraction exists.
- Profile gaps from Session 5 still do not create tasks (by design).

## Repair Session 5 — the agent reads the student's actual profile (2026-10-03)
### What was wrong (found by reading the code, then confirmed by tests on the new code)
1. `getStudentProfile` returned only `{nationality, education[level, field, cgpa, cgpaScale, dates]}` (the Module 09 shape). **Experiences, institution, degree name, city and full name were never read.**
2. `stateDigest` (the only student/scholarship context the model gets) contained **no profile data**. The model could not answer "what degree / field / CGPA / experience / what is missing", and the tests' mock profile hid this.
3. A missing profile row and a failed query were the same `null` -> "unavailable".
### What is stored (audited against the migrations)
`profiles`: full_name, nationality, city (+ role, date_of_birth: **not** exposed; dob is not collected). `education`: level, degree_name, field, institution, cgpa, cgpa_scale, start_date, expected_graduation. `experiences`: experience_type, title, organization, description, start_date, end_date. `documents` is metadata only and has its own tool. `applications`/tasks are not profile data. **No other profile table exists; no field was invented.**
### Changed
- `src/lib/profile/queries.ts`: new `loadOwnProfileResult` -> `ok | missing | error`; `loadOwnProfile` delegates (same return as before). Explicit `user_id` / `profile_id` filters kept.
- NEW `src/lib/agent/profile.ts` (pure): `toAgentProfile` (sanitise/cap/never invent), `profileMissing`, `isAgentProfile`, `profileDigest`. `types.ts`: `AgentProfile` (+ `state.profile`). `config.ts`: `profile` caps.
- `executors.server.ts#getStudentProfile`: session identity only, input ignored, error vs missing, returns the full `AgentProfile`. `orchestrator.ts`: output contract is `isAgentProfile`. `model.ts#stateDigest`: profile section with a reserved budget; the full name is **not** sent to Gemini.
- Not touched: Module 09 matching, `checkEligibility`, report/task/roadmap content, RLS, migrations, document extraction, Module 14, any client component. No dependency added.
### Tests (observed this session, local sandbox)
| Check | Result |
|---|---|
| `tests/agent` unit | 66 pass (one fixture moved to the new profile shape on purpose; nothing weakened) |
| NEW `tests/agent/profile.test.cjs` (real executor + real loader against an in-memory Supabase stand-in `fake-supabase.cjs`; columns checked against the real DDL) | **31 pass**: complete profile, education, experience, missing profile, empty profile, malformed data, caps, Student A vs B, malicious `userId` (executor, policy, model-proposed), admin/no-RLS defence in depth, end-to-end runs for two students, failure != empty, output contract, digest content |
| discovery 33; static 28 (+1 profile check) | pass |
| `test:agent-mutation` new mutants | **12/12 killed** (model-supplied userId, dropped `user_id` filter, error shown as empty, education/profile missing from digest, NaN/over-scale CGPA believed, omissions uncounted, unvalidated output, full name leaked to model, uncleaned text, missing row reported as unreadable); files restored. The 33 older mutants were not re-run |
| neighbours: profile validation 36; matching unit 55+22, flow 19, static 26; knowledge/assistant/details/search/documents/admin-scholarships static | pass |
### BLOCKED / not proven
- **Two-student integration test on real Supabase: BLOCKED** (no credentials/network). The isolation above is proven on an in-memory stand-in whose RLS is hand-copied, **not** real PostgREST/RLS. `test:db` not run (no Postgres).
- `npm ci`, `next typegen`, `typecheck`, `lint`, `build`: not run (no `node_modules`). The pure agent modules were type-checked with `tsc --strict`; `executors.server.ts` and `profile/queries.ts` were compiled with `--noCheck` only. Run the full gate before trusting them.
- No real Gemini call: what the model *does* with the profile section is untested live. Tests prove the model is **given** the stored facts and that ungrounded numbers in its wording are dropped.
- Older `run-unit.sh` scripts need `--ignoreConfig` with TypeScript 6 (set `TSC_EXTRA="--ignoreConfig"`); unchanged environmental issue.
### Live check to run (owner)
Create students A (profile + 2 education + 2 experiences) and B (different data), and C (profile row, nothing else). Sign in as A, run "Prepare me for this scholarship": the summary and tasks must reflect A only. Repeat as B and C (C: nothing about degree/CGPA/experience may be stated). In the Network tab only `/api/agent/run` is called. Then `select * from education/experiences` as A through the REST API must return only A's rows (`npm run test:db` on Postgres with the migrations).
### Known limits / decisions for the owner
- `checkEligibility` still uses Module 09's `loadMatchProfile`; for a student with **no profile row** it returns `unavailable` while the profile tool reports "no profile". Decide whether eligibility should treat that as "needs information".
- Profile gaps (`AgentProfile.missing`) feed the model digest but **not** the saved tasks/roadmap (to avoid creating new rows in the student's account). Say if you want "Complete your profile: ..." tasks from them.
- Experience descriptions and other free text go to Gemini inside the digest (single-line, capped, neutralised). The full name does not. Confirm this is acceptable under the privacy policy.
- "Currently studying" is not a stored fact; the agent only has `level`, dates and what the student typed.
- Document extraction and Module 14 were not started.

## Repair Session 4 — AI scholarship discovery (2026-10-03)
### What was broken (reproduced on the unmodified zip)
"Find fully funded Master's scholarships in Germany for Computer Science." -> `classifyGoal` = `ambiguous` -> `goal_unsupported`, **0 model calls, 0 searches**. Behind that: the agent's `searchScholarships` was its own `name/provider ILIKE %phrase%` query (not Module 08, ignored country/degree/field/funding); several matches or zero matches both ended as `scholarship_not_identified` and discarded the candidates; and no UI accepted free text.
### What changed (rules: ADR-037)
Model -> strict criteria JSON -> registry validation -> `resolveCriteria` against real DB vocabulary -> the **existing** `getScholarships` -> real rows -> server-built explanation. New `src/lib/agent/discovery.ts` (pure), `criteriaPrompt/parseCriteria` in `model.ts`, `runDiscovery` + identification fix in `orchestrator.ts`, adapter delegating to injected `getScholarships/getFilterOptions`, `DiscoveryPanel` on `/scholarships` (signed-in users; posts to the existing `/api/agent/run` with no scholarshipId). States: `selected` (exactly one real match) / `selection_required` (candidates + true total, never auto-picked) / `no_results` / `invalid_criteria`; DB failure = `tool_failure`, never "no results". Unknown country is never dropped. Discovery is read-only. Also fixed in the preparation flow: several matches no longer silently stop with no candidates.
Two existing tests changed on purpose: "several => not identified" encoded the bug (rewritten); `searchScholarships` mock results moved to the new shape.
### What passed (local only; see PROGRESS "Repair Session 4 — details")
Agent unit 66 + discovery 33 + static 27; mutation 33/33 killed (8 new); neighbouring static suites green. The seven requested areas are covered: NL -> criteria, one / multiple / zero results, invalid criteria, malicious model output (hostile values, extra keys, injection), arbitrary tool use.
### What is BLOCKED / not proven
- **No real Gemini call was made.** Live AI discovery is NOT verified. Tests use a mocked model; Gemini availability, JSON compliance and the default model name remain unverified. With no key the run ends `model_unavailable` (503); there is no fallback for discovery.
- The search tests use an **in-memory stand-in** for `getScholarships` (filter semantics only). Not PostgREST, not RLS, not real data. The real filters it receives are asserted; real results are not.
- `npm ci`, typecheck, lint, build, browser/UI, `test:db`, `test:auth`: not run. Server adapter/panel/page were checked only with ambient stubs (clean apart from a stub artifact). Run the full gate before trusting the TSX.
- Several older `run-unit.sh` scripts fail in this sandbox on the TS6 flag issue (unchanged code).
### Do next (owner)
1. `npm install && npx next typegen && npm run lint && npm run typecheck && npm run build && npm run test:agent && npm run test:agent-mutation && npm run test:search`.
2. Staging with real keys and published data: sign in, open `/scholarships`, run the sample request. Expect one row -> selected; drop "fully funded" -> several -> list with total; ask for Narnia -> no_results; unset `GEMINI_API_KEY` -> "not available". Check the Network tab: only `/api/agent/run`.
3. Review how real `degree_level` / `field` values are worded; degree is mapped by the Module 09 parser, field is exact-or-keywords.
### Known limits
Model prose about results is deliberately not used (cannot be grounded). Keyword search is AND-ed substring matching (more than 5 tokens or 6 degree/field variants are reported as dropped and block auto-selection). No rate limit/cost cap on the route. Student profile and Module 14 not touched.

## Repair Session 3 — Student-to-scholarship matching (2026-10-03)
### Summary
Only matching was touched. Root cause: the **overall result** was wrong, not the data path. (1) Missing student field of study still gave "Likely eligible" for field-restricted scholarships; (2) a clearly different field was "Likely eligible" (shown with "show all") next to "Does not match your profile"; (3) no distinction between *needs information* (profile gap) and *unknown* (cannot be decided). Fix and rules: **ADR-036** in `docs/DECISIONS.md`.
### Changed
`src/lib/matching/{types,eligibility,explain,rank,index}.ts` (new `decision`, field gating, `deriveDecision`, `byDecision` counts, `DECISION_LABEL/DESCRIPTION`), `src/components/matches/match-card.tsx` (badge shows the decision, `data-decision` attribute), `src/app/(protected)/matches/page.tsx` (explainer: four answers + "Not checked at all"). Tests: NEW `tests/matching/{scenarios.test.cjs,flow.test.cjs,run-flow.sh}`, edited `matching.test.cjs` (1 test rewritten, 1 extended), `security-static.test.cjs` (+4), `run-unit.sh` (runs scenarios; works with TypeScript 5 and 6), `ui.mjs` and `tests/auth-mock/e2e.mjs` (labels -> `data-decision`; never executed), `package.json` (`test:matching` now also runs `run-flow.sh`). **Not modified:** agent, RAG, assistant, migrations, any other module.
### What matching evaluates (do not overstate in UI/docs)
Degree level, minimum GPA with scale, field of study (word overlap; never makes anyone *not eligible*), deadline, active status. Written requirement rows are listed, never verified. **Not evaluated:** nationality, age, IELTS/English scores, research, preferences, `structured_value`.
### Verification (precise)
See "Repair Session 3 — details" in `docs/PROGRESS.md`. Summary: unit 55, scenarios 22, flow 19, static 26, profile 36, search 22+11, details 19+14, agent unit 65 (compiled with `--noCheck`) and static 23 all pass; 5 mutations caught. The flow test uses an **in-memory Supabase stand-in** (columns validated against the real migrations, RLS policies copied by hand): it proves the app code's queries/mapping/identity handling, **not** real PostgREST or real RLS.
### BLOCKED — live Supabase (do this next)
No credentials/network here. To verify live: create two students (A with Bachelor CS completed + CGPA 3.6/4, B with a Master's), publish one Master CS scholarship with min GPA 3.0/4 plus one draft; sign in as A -> `/matches` must show it as "Eligible on the checks we can run" and never the draft; delete A's CGPA -> "Needs information from you"; as A, `select * from education` through the app/REST must return only A's rows; `npm run test:db` on a Postgres with the migrations. Also run `npm run typecheck`, `lint`, `test:matching-ui`, `test:auth` (not run; changed `.tsx` files unchecked).
### Known limits / suggested follow-ups (not done, need decisions)
Required document rows keep scholarships from `eligible` (needs a requirement-type convention); field matching is word overlap (IT vs CS looks unrelated, hidden by default but counted and revealable); in-progress same-level degree counts as not eligible; `todayIsoDate()` is UTC; `npm ci` lockfile issue unchanged. Module 14 not started; AI agent not modified.

## Repair Session 2 — Scholarship search / Apply filters (2026-10-03)
### Root cause (reproduced, then fixed)
`/scholarships` filter inputs are **uncontrolled** (`defaultValue`). The "Reset filters" link, the active-filter chips (×) and browser back/forward are client-side navigations, so React kept the same `<form>` DOM: the URL and results changed, but the selects still showed (and submitted) the OLD values. The next Apply / select change silently re-submitted the stale hidden filters (e.g. Reset after `country=japan`, then pick funding `partially_funded` -> URL got `country=japan&funding=partially_funded` -> "No scholarships match these filters").
NOT the cause (checked): parameter names, URL parsing/validation (`parseScholarshipFilters`), filter mapping, column names (all exist in migration 02), PostgREST condition syntax (generated URLs inspected), NULL handling (`deadline.is.null` in `or`), repeated `or=` (AND-ed), pagination, sorting, RLS (anon sees only `active`), error->empty conversion (query failures render the "temporarily unavailable" state, verified).
### Fix
`src/app/scholarships/page.tsx`: `<form key={filtersKey(filters)}>` remounts the form whenever the URL filters change. `src/lib/public/filters.ts`: new pure `filtersKey()` (canonical URL, page excluded). No query, matching, agent, RLS or migration code changed.
### Tests
- `tests/search/filters.test.cjs` +2 (filtersKey; page keeps the `key`). `test:search` now 22 unit + 11 static. Mutation: removing the `key` fails the new unit test and 3 browser checks; restored.
- NEW `tests/search/ui-regression.cjs` (browser; not in `npm run test:search` because it needs a running app + seeded data + Playwright): no filters, one filter, intersection, Reset (also clears stale form values), post-Reset filtering, chip removal, back/forward, pagination keeps filters, refresh keeps state. 9/9 pass after the fix; 3 fail without it.
- Regression: admin-scholarships 37+22(pipeline)+25, matching 55+22, details 19+14, profile 36, documents 43+22, typecheck: pass. `test:auth`: 3 + 1 failures in the signup/session-refresh e2e (`log.some is not a function`) -- **identical on the untouched Session 1 zip in this sandbox**, so pre-existing/environmental and unrelated. `test:db`, `test:profile-ui`, `lint` (whole repo) not run this session.
### How it was verified (be precise)
- Real data: a throwaway LOCAL Postgres 16 with migrations 01-04 applied (RLS on) and 20 test rows (published + one draft), queried as role `anon`. No real Supabase project, no real PostgREST (binary not obtainable in the sandbox; pgvector missing so migration 05/06 were not applied -- irrelevant to search).
- Between Next.js and Postgres sat a small PostgREST-LIKE translator written for this session (kept in scratch, NOT committed). It supports only the request shapes in `queries.ts`, so true PostgREST parsing quirks remain unverified; the generated request URLs were inspected by hand and use standard syntax.
- Real Chromium (Playwright) drove the real Next.js dev server. DB failure was simulated by renaming the table: page showed "temporarily unavailable", never "no scholarships".
### Notes / not done
- `npm ci` fails: `package-lock.json` is out of sync with `package.json` (@emnapi entries). Pre-existing; I used `npm install --no-package-lock` and left the lockfile untouched. Owner should regenerate it.
- Unconfigured and failed-query states share one "temporarily unavailable" message (by design, unchanged).
- Session 3 / Module 14 not started.

## Module 13 — Agentic Scholarship Assistant (2026-10-02)
### Status
**PARTIALLY_COMPLETE.** Implemented per ADR-035. Not COMPLETE because real Gemini, real Supabase, SQL execution and end-to-end checks could not run. Inherited premise: Modules 11 and 12 are themselves PARTIALLY_COMPLETE (never live-verified); nothing here changes that.

### Implemented
- `src/lib/agent/`: `config.ts` (limits), `types.ts`, `validators.ts`, `tools.ts` (registry: 11 executable + 6 FORBIDDEN names), `policy.ts` (decision order), `state.ts`, `plan.ts`, `eligibility.ts` (Module 09 engine -> eligible/not_eligible/unknown/needs_information), `approval.ts` (HMAC-signed tokens), `model.ts` (prompts/parsers), `report.ts` (server-built tasks/roadmap/next action), `validate.ts`, `orchestrator.ts` (bounded loop, `resumeApproval`, `toPublicRun`), `index.ts`; server-only `executors.server.ts`, `service.server.ts`.
- `src/app/api/agent/run/route.ts` — `POST` `{action:"start",goal,scholarshipId}` or `{action:"decide",token,decision}`; 415 non-JSON, 403 unless same Origin (a missing Origin is rejected), 401 signed-out, 400 invalid, generic errors.
- `src/components/scholarship/agent-panel.tsx` mounted in `assistant-panel.tsx` (progress list, eligibility, conflicts, missing items, tasks, roadmap, sources, next action, approve/decline).
- `supabase/migrations/20261003000100_application_roadmaps.sql` (+ owner-only RLS, `owns_roadmap()`).
- Tests: `tests/agent/{run-unit.sh,agent.test.cjs,security-static.test.cjs,mutation.test.cjs,migration-hashes.json}`; `package.json` + `test:agent`, `test:agent-mutation`.
- Edited earlier tests (justified, nothing weakened): migration-list pins in `tests/{details,search,documents,assistant}/security-static.test.cjs` now include the one known Module 13 migration (any other migration still fails); `tests/knowledge/security-static.test.cjs` allow-list now also admits `agent/service.server.ts` (must be `server-only`) and `agent/executors.server.ts` (`server-only`, type-only knowledge import). Edited docs: `DECISIONS.md` (ADR-035), `PROGRESS.md`, this file. **No Module 02–12 source file was edited** except `assistant-panel.tsx` (mounts `AgentPanel`). No dependency added.

### Tests (observed this session, local sandbox)
| Check | Result |
|---|---|
| `npm ci` | **FAIL** (lockfile out of sync: `@emnapi/runtime` missing — pre-existing, not caused by this module). Dependencies installed with `npm install --no-package-lock`; lockfile byte-unchanged |
| `npx next typegen` / `npm run typecheck` | PASS / PASS (0 errors) |
| `npm run lint` | PASS 0 errors; 2 pre-existing "unused eslint-disable" warnings in `assistant/{prompt,validate}.ts` |
| `npm run build` | PASS (`/api/agent/run` listed) |
| Secret scan of `.next/static` (names, and actual `.env.local` secret values) | 0 hits |
| `test:agent` unit (mocked executors + mocked Gemini) | PASS 65/0 |
| `test:agent` static | PASS 23/0 (text checks only) |
| `test:agent-mutation` | 25/25 killed, 0 survived; all files hash-verified restored |
| `test:assistant` 26 unit + 16 static; `test:knowledge` 59 + 18; details 19+14; matching 55+22; search 11 (static); profile 36; documents 43+22; admin-scholarships 37+25 | PASS |

Mutations covered: unknown tools, forbidden tools, approval bypass, no identity, cross-scholarship, no tool/iteration/time limits, no autonomy ceiling, model-proposed tools, skipped output validation, ungrounded model text, dropped conflicts, missing=eligible, removable required steps, no prompt neutralisation, unsigned/foreign/non-gated/expired approval tokens, RAG scholarship filter, document owner filter, optional origin check, no auth in route, missing `server-only`.

### Blocked (environment)
- `test:db`, migration apply, RLS tests for the two new tables: no Postgres/pgvector in the sandbox. **The migration has never been executed.**
- Real Gemini (structured output, malformed output, failures): outbound network limited to an allow-list that excludes Google and Supabase.
- Real Supabase (student isolation, task/roadmap RLS, RAG retrieval, end-to-end "Prepare me for this scholarship"): same reason.
- `test:auth`, `test:matching-ui`, `test:profile-ui`, `test:documents-live`, any browser/UI run: not run.

### Security verification (actually tested)
Unit/mock: unknown/prototype/forbidden tools rejected; malformed input rejected for every tool; extra fields (userId/approved) stripped; executors receive only the session user; one scholarship per run; read-only vs low-risk vs approval-required paths; approval-gated calls never execute in the loop; token tamper/foreign-user/expired/non-gated rejected; every limit; hijacked-model simulation (forbidden tools, other student/scholarship, fake approval, secret leakage) fails; missing data never becomes `eligible`; conflicts surfaced; public result has no user id/secrets. Static: route order (415/403/401 before parsing), mandatory Origin, server-only adapters, user RLS client only, no service-role in adapters, service-role used only to derive the approval key, no agent code in client components, no NEXT_PUBLIC secrets, Gemini via the Module 12 provider only, no embedding code in the agent, migration RLS/grants, earlier migrations hash-pinned. **Not tested live:** RLS behaviour of the new tables, real cross-student isolation, real Gemini behaviour.

### Known limitations
Not live-verified anywhere. `analyzeDocument` always returns `analysis_not_supported` (no extraction pipeline). Approval tokens are stateless, replayable until the 15-minute expiry (gated tools are idempotent). Roadmap-step replacement is non-atomic. No rate limit/cost cap, run history or audit log. No scheduled L3 monitoring. Goal classification is keyword-based (English only). Auto-identification adopts a scholarship only if a name search returns exactly one result. `x-forwarded-host` is trusted for the origin check (as in Module 12). The agent creates an `applications` row (status `planning`) when saving tasks/roadmap — Module 14 should decide whether that is the right trigger. The uploaded zip contained a `.env.local`; treat any key in it as exposed if the archive was shared and rotate it. Generation model default (`gemini-3.1-flash-lite`) and embedding model availability remain unverified (see Module 12 notes).

### Next required action
1. On a machine with registry access: fix the lockfile (`npm install`), then `npm ci && npx next typegen && npm run lint && npm run typecheck && npm run build && npm run test:agent && npm run test:agent-mutation && npm run test:assistant && npm run test:knowledge`.
2. Apply the migration on Postgres (`npm run test:db` after adding RLS tests for `application_roadmaps`/`application_roadmap_steps`: student A cannot read/insert/update/delete student B's roadmap or steps; anon denied).
3. With real keys on staging: one real Gemini call through the agent (valid JSON plan/rag/review/summary replies; malformed-output fallback), then run "Prepare me for this scholarship" as two different students and verify tasks/roadmap/isolation, approval flow (existing roadmap -> approve/decline), signed-out 401, cross-origin 403.
4. Only after that, mark Module 13 COMPLETE. **Do not start Module 14 before then.**

---
## Module 12 — RAG Assistant (2026-10-02) 
**Status: PARTIALLY_COMPLETE.** Implemented per ADR-034; **not** fully verified. Module 13 was not started.

**Premise caveat.** The task prompt said Module 11 is "COMPLETED and VERIFIED". No evidence of that reached this session (the Module 11 owner checklist below has no recorded results), so Module 11 stays PARTIALLY_COMPLETE in the repo and Module 12 inherits that: **nothing here has run against a real database**.

**Built.** `src/lib/assistant/{config,validate,prompt,generation,answer,index}.ts` (pure), `service.server.ts` (server-only; reuses Module 11 `retrieve()`), `src/app/api/assistant/ask/route.ts`, `src/components/scholarship/assistant-panel.tsx`, mounted in `src/app/scholarships/[id]/page.tsx`; `tests/assistant/*`; `package.json` + `test:assistant`; `.env.example` (optional `GEMINI_GENERATION_MODEL`); ADR-034; PROGRESS. **No migration, no dependency.**
**Also changed (justified):** `tests/knowledge/security-static.test.cjs` — the rule "nothing outside the admin route imports knowledge code" now allow-lists exactly `assistant/service.server.ts` (must be `server-only`) and type-only imports in `assistant/{answer,prompt}.ts`. Two mutations (a client component importing knowledge; a value import in `answer.ts`) still fail it. No Module 11 source file was edited. The details page gained the assistant section and a display-only `getAuthState()` call.

**Behaviour.** Signed-in users only (401 otherwise); same-origin + JSON-only; scholarship must be RLS-visible to the caller (404); retrieval scoped by scholarship id; chunks of any other scholarship are dropped before the model; empty evidence => fixed refusal with **no model call**; model must return JSON, `answered` needs valid citations else failure; only cited chunks are returned as sources (copied from retrieval); `insufficient` shows a fixed server message; errors are generic codes.

| Check | Result |
|---|---|
| `test:assistant` unit (compiled with `tsc` 6.0.3 `--ignoreConfig`; mocked retrieval + mocked Gemini HTTP) | PASS 26/0 |
| `test:assistant` static | PASS 16/0 (text checks only) |
| Mutations: drop scholarship filter; allow uncited answer; remove neutralisation; auth after body parsing | each failed at least one test; files restored |
| `test:knowledge` unit (needs stub node typings outside repo) / static | PASS 59/0 / PASS 18/0 (after the allow-list change) |
| static: details 14, matching 22, search 11, admin-scholarships 25, documents 22 | PASS |
| `npm ci`, typegen, `lint`, `typecheck`, `build` | **BLOCKED** (registry 403). The route, server wiring, client panel and edited page are **not type-checked**; `unknown`/JSX/Next 16 typing issues are possible |
| `test:db` | not applicable to this module (no DB change); Module 11's 53 checks still **BLOCKED** |
| Real Gemini `generateContent` | **BLOCKED** (no key) |
| Real Supabase (RLS read of `scholarships`, retrieval, end-to-end) | **BLOCKED** |
| Browser/UI check | **NOT RUN** |

**Things to check first (owner).**
1. `npm ci && npx next typegen && npm run lint && npm run typecheck && npm run build`; confirm no key appears in `.next/static`.
2. **Generation model:** default `gemini-3.1-flash-lite` came from third-party model lineups; Google's deprecation pages I saw were inconsistent about 2.5 models. Make one real call; if 404, set `GEMINI_GENERATION_MODEL` to a current model.
3. **Possible Module 11 problem:** one Google deprecation listing I saw appeared to show `gemini-embedding-001` with a **shutdown date of July 14, 2026** (the table was ambiguous). If real, the Module 11 embedding provider (and every stored vector) is affected and a new model/migration decision is needed. Verify at ai.google.dev/gemini-api/docs/deprecations before relying on any live result.
4. With real data: ask 5–10 questions (including "is IELTS required?" against a page with a conditional), check the cited source/excerpt matches, ask something the source doesn't cover (expect the refusal), un-verify the source (answers must stop citing it), call the route signed out (401), as a student for a draft scholarship (404), cross-origin (403).
5. Decide a rate limit/cost cap before exposing this widely.

**Known limitations.** Prompt-injection defence is mitigation, not proof; a poisoned source can still be cited. No similarity threshold or benchmark. No history, logging or rate limiting. Answer quality and the JSON-output behaviour of the chosen model are untested live. HTTP status handling in the UI is by code only.

**Next required action.** Complete the checks above plus the Module 11 checklist. Do **not** start Module 13 until then.

---
## Module 11 Verification Session (2026-10-02) — latest entry
**Module 11 status: PARTIALLY_COMPLETE (unchanged). Not eligible for COMPLETE.**
Environment: npm registry 403 (`npm ci` FAILED: E403 on zod-validation-error), no `node_modules`, no Postgres/psql/Docker/Supabase CLI, no `GEMINI_API_KEY`, no Supabase credentials, no git repo (diff check impossible).

| Check | Result |
|---|---|
| `npm ci` | FAIL (environment, 403) |
| typegen / `npm run lint` / `npm run typecheck` / `npm run build` | BLOCKED (need node_modules) |
| Module 11 unit tests (compiled with `tsc` 6.0.3, `--ignoreConfig`, stub typings for node:crypto/net outside the repo) | PASS 59/0. Mocked I/O only, not live |
| `node tests/knowledge/security-static.test.cjs` | PASS 18/0 (text checks only) |
| Static suites: details 14, matching 22, search 11, admin-scholarships 25, documents 22 | PASS |
| Unit suite: details 19 | PASS. Other earlier-module unit suites not re-run |
| `test:db` (53 checks), migration apply, pgvector, RLS, `match_knowledge_chunks` | BLOCKED (no Postgres) |
| Live Gemini (768 dims, error handling) | BLOCKED (no key) |
| Live Supabase ingest/retrieval/RLS | BLOCKED (no staging access) |
| Owner checklist (below) | NOT DONE |

Static inspection only (not proof of behavior): route.ts is nodejs/force-dynamic, JSON-only (415), same-origin host check, 401/403 before body parsing, accepts only a UUID `sourceId` or `{eligible:true, limit 1..10}`, generic errors. Migration declares `vector(768)`, HNSW cosine index, RLS on both tables, anon/authenticated revoked, service_role-only SECURITY INVOKER match function. Observations: (1) requests with no Origin header skip the same-origin check (admin auth still required); (2) host comparison trusts `x-forwarded-host`; both worth a look at staging. No code changed, no bugs confirmed, no fixes made.

Next required action (owner): run on a machine with registry access `npm ci && npx next typegen && npm run lint && npm run typecheck && npm run build` (also confirm no service-role/Gemini key in `.next/static`; check route exports against Next 16 docs); run `npm run test:db` on Postgres with pgvector; one real Gemini embedContent call; then the Manual Verification Checklist below on staging. Do not start Module 12 until these pass.

---
## Module Worked On
Module 11 — RAG Knowledge Base

## Status
**PARTIALLY_COMPLETE.** Implemented. Verified **only** by (a) pure unit tests with **mocked** fetch/DNS/embedding/store, (b) static source/SQL checks, (c) regression suites of earlier modules. **Never run:** the migration or the 53 new SQL tests (no Postgres/pgvector in the sandbox), `npm ci`/lint/typecheck/build (npm registry returned 403 → no `node_modules`), any browser test, anything against real Supabase, **any call to the real Gemini API**. Do not mark COMPLETE until the checklist below passes. Module 10 was reported as owner-approved in the task prompt; its status row was left as it was.

## Roadmap requirement (source of truth)
`docs/MODULES.md`: "Source ingestion, extraction, chunking, embeddings, pgvector, metadata and retrieval." Plus `docs/RAG.md` (ingestion flow, chunk metadata, source priority) and `docs/DATABASE.md` §5. **Backend-only — no page/UI was added** (none is required; Module 12 = assistant, Module 18 = admin RAG UI). All decisions: **ADR-033** (read it first).

## What Was Built
- **Eligibility** (`eligibility.ts`): source `active` ∧ scholarship `active` ∧ `last_verified_at` valid & not in the future ∧ safe URL. Never-verified ≠ verified. `source_type`/`priority` carried as recorded; nothing is ever called "official".
- **Fetch** (`url-safety.ts`, `fetch.ts`): http/https only, ports 80/443, no credentials, no localhost/internal names, private/reserved IPv4+IPv6 (incl. obfuscated and mapped forms) blocked, DNS-resolved addresses all checked, manual redirects (max 3, each hop re-validated), 2 MB streamed cap, 15 s timeout, text-only content-type allow-list. **PDF unsupported by design** (→ `unsupported_content_type`).
- **Extraction/normalize/chunk** (`extract.ts`, `normalize.ts`, `chunk.ts`): dependency-free deterministic HTML/plain-text extraction; h1–h3 → `section`; chunks ~1000 chars (max 1400, overlap 150), version-tagged, sha256 per chunk; never cross sections; never silently truncated.
- **Embeddings** (`embeddings.ts`): `EmbeddingProvider` interface; `GeminiEmbeddingProvider` (`gemini-embedding-001`, 768 dims, task types RETRIEVAL_DOCUMENT/QUERY, local L2-normalize, response validation, key only in `x-goog-api-key`). No fake provider.
- **Pipeline** (`pipeline.ts`): eligibility → fetch → extract → hash → unchanged-skip → chunk → embed → validate → persist → status. Failures store only a short code in `error_code`.
- **Retrieval** (`retrieve.ts` + SQL `match_knowledge_chunks`): validated query → query embedding → cosine search → chunks with source/scholarship references and **raw cosine similarity** (not a probability). Empty result is a normal `ok: []`. No threshold (needs the RAG benchmark).
- **Server-only wiring** (`store.server.ts`, `service.server.ts`): service-role persistence (reason documented in ADR-033 §6), Gemini provider from `getAiKeys()`, `ingestSourceById`, `ingestEligibleBatch`, `retrieve`.
- **Trigger**: `POST /api/admin/knowledge/ingest` (admin only, JSON only, same-origin, accepts only `{sourceId}` or `{eligible:true,limit≤10}`; never a URL; generic responses).

## Files Created
`supabase/migrations/20261002000100_rag_knowledge_base.sql`; `src/lib/knowledge/{config,url-safety,fetch,normalize,extract,chunk,embeddings,eligibility,pipeline,retrieve,index}.ts`, `src/lib/knowledge/{store,service}.server.ts`; `src/app/api/admin/knowledge/ingest/route.ts`; `tests/knowledge/{run-unit.sh,knowledge.test.cjs,security-static.test.cjs}`.

## Files Modified
`tests/db/rls.test.sql` (+53 Module 11 checks, appended; nothing removed); `tests/db/run-rls-tests.sh` (+ early pgvector availability check; nothing else); `tests/{search,documents,details}/security-static.test.cjs` (the "no migration added by Module 06/08/10" assertions were pinned to exactly 4 files and broke on the legitimate Module 11 migration. Now: the folder must equal the four originals + only the known Module 11 file, so any *unexpected* migration still fails; verified by a mutation); `package.json` (+`test:knowledge`); `.env.example` (comment only); `docs/{PROGRESS,HANDOFF,DECISIONS,DATABASE}.md`. **No application code of Modules 02–10 was changed.** Migrations 01–04 are byte-identical (sha256 pinned in the static test).

## Files Deleted / Dependencies
None deleted. **No new dependency.** (PDF support would need one — a future decision.)

## Environment Variables
`SUPABASE_SERVICE_ROLE_KEY` (server-only, already existed), `GEMINI_API_KEY` (server-only, already in `.env.example`; first real use). No new variable, none public. Model and dimensions are constants in `config.ts`, not env.

## Tests Run (observed in this session, LOCAL sandbox only)
Sandbox quirks: no `node_modules`/npm access, no Postgres. TypeScript here is v6 (rejects `tsc file.ts` with a tsconfig present), so suites were run through a throw-away `npx` shim adding `--ignoreConfig --typeRoots <@types/node> --types node`. Repo scripts are unchanged; `run-unit.sh` accepts `TSC_EXTRA` for this purpose.

| Check | Result | Kind |
|---|---|---|
| `test:knowledge` unit | 59 pass | unit + **mocked** I/O (fetch, DNS, Gemini, store) — NOT live |
| `test:knowledge` static | 18 pass | source/SQL text checks — not runtime proof |
| `test:details` 19+14, `test:matching` 55+22, `test:search` 20+11, `test:profile` 36, `test:documents` 43+22, `test:admin-scholarships` 37+25 | pass (same counts as before) | regression, local |
| Mutation checks (21): unblock link-local IPv4; unblock NAT64; allow any protocol; skip validation on redirect hops; drop streamed size cap; accept any content type; allow PDF; never-verified eligible; future date accepted; skip eligibility gate; drop embedding dimension check; non-deterministic chunk hash; drop http(s) check on returned URLs; upgrade source_type to "official"; match fn returns unverified; match fn returns draft scholarships; grant tables to anon; let clients execute match fn; drop RLS on chunks; drop admin check in route; drop `server-only`; edit an applied migration | each made at least one test fail; files restored byte-identical (hash-checked). A harmless control change correctly did NOT fail. Also: an unexpected extra migration file makes the Module 08/10 static tests fail. | local |
| Stub-based `tsc --strict --noUnusedLocals` over `store.server.ts`, `service.server.ts`, the route | 0 errors in Module 11 files; an injected typo was caught | **NOT the project typecheck** (Supabase/Next typed as `any` stubs) |

Initial run had 3 failing tests of my own (two wrong expectations, one test-helper default-parameter bug) — fixed in the tests only after confirming the code behaved correctly; no code or test was weakened.

## NOT RUN (must be done before COMPLETE)
1. `npm ci`, `npx next typegen`, `npm run lint`, `npm run typecheck`, `npm run build` — particularly the route handler (`runtime`/`dynamic` exports, `NextResponse.json` init) which was **not checked against the Next 16 docs** (AGENTS.md requires it; `node_modules` was absent). Confirm the production bundle has no `SUPABASE_SERVICE_ROLE_KEY`/`GEMINI_API_KEY` in `.next/static`.
2. `npm run test:db` on a Postgres **with pgvector**: apply migration 05 and run the 53 new checks. Most likely trouble spots (never executed): `create extension vector with schema extensions` and the `extensions` schema in the local shim, `test.vec()` helper literals, `extensions.vector` in function signatures/`revoke`, HNSW operator class name, error SQLSTATEs. Expect to fix small SQL/test issues; **do not weaken a security check to make it pass**.
3. `npm run test:auth` (without `.env.local`), `test:matching-ui`, `test:profile-ui`, `test:documents-live` (earlier modules, still outstanding).
4. **Real Gemini**: one real `embedContent` call with a valid key (check HTTP 200, `embedding.values.length === 768`, `outputDimensionality` honored, non-trivial similarity ordering). Never executed.
5. **Real Supabase** (owner): see checklist below.

## Manual Verification Checklist (owner)
1. Apply the migration to a **staging** Supabase project (pgvector is available there). Confirm both tables show RLS enabled; as a student (anon key + student JWT) `select * from knowledge_chunks` returns 0 rows / permission denied, and `rpc('match_knowledge_chunks', …)` is denied; as admin the tables are readable but not writable.
2. Pick 1–2 real scholarships with a real official HTML page; make sure the source row is `active`, the scholarship `active`, `last_verified_at` set. As admin (browser console, signed in): `fetch('/api/admin/knowledge/ingest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceId:'<uuid>'})}).then(r=>r.json())` → expect `{result:{status:'ready',chunkCount:N}}`. In SQL check `knowledge_documents` (status `ready`, model/dimension, hash) and a few `knowledge_chunks` rows: does `content` match the page? are sections sensible?
3. Re-run the same call → `unchanged` (no new embedding cost). Then try: a never-verified source, an inactive source, a draft scholarship (each → `skipped`), a PDF URL source (→ `failed` / `unsupported_content_type`), a JS-only page (→ `failed` / `empty_content`). Confirm `error_code` is only a short code.
4. As student or anon: POST to the route → 403/401. Cross-origin POST → rejected.
5. Retrieval (server-side script or temporary admin-only debug call using `retrieve()` — no UI exists): ask 5–10 real questions (deadline, GPA, documents). Check the right chunk is near the top, `source.url` is the page you ingested, and inspect the **raw similarity values** to inform Module 12's threshold. Un-verify the source (`last_verified_at = null`) → its chunks must vanish from results immediately.
6. Try source URLs pointing at `http://127.0.0.1`, `http://169.254.169.254`, a redirect to such an address, and a huge file: all must end `failed` with `blocked_url` / `response_too_large`, without a request reaching the target.

## Known Issues / Limitations
- **Not live-verified anywhere** (see above). Gemini request/response shape comes from Google's docs read in this session, not from a real call.
- PDF and JS-rendered pages unsupported. HTML extraction is heuristic; navigation text inside `<div>`s (not `<nav>`) will be included.
- DNS-rebinding window (resolve-then-connect) is not closed; ports other than 80/443 are rejected.
- Ingestion is not transactional: a re-ingested document is hidden from retrieval until it is `ready` again; two simultaneous ingestions of one source can race.
- `ingestEligibleBatch` runs sequentially inside one HTTP request (limit ≤ 10) — long batches may hit platform timeouts; Module 18 should add a job/queue.
- HNSW + selective filters can return fewer than `limit` rows (post-filtering).
- No similarity threshold, no RAG benchmark, no source-priority/conflict handling (ADR-026's "lower number = more trusted" is still unconfirmed); no audit-log entry for ingestion; no admin UI.
- `test:db` now requires pgvector locally.

## Next Module
After the checklist passes: **Module 12 — RAG Assistant** ("Scholarship-scoped Q&A using retrieved official evidence, citations/source display and refusal when evidence is insufficient"). It must call `retrieve()` from server code only, after authorizing the student; must treat `source_type` as recorded (not "official" unless the stored data says so); must refuse when evidence is weak (the threshold needs the benchmark from `RAG.md`).

## Do Not Change
The access model (admin-read-only tables, service-role writes, `match_knowledge_chunks` for `service_role` only with visibility inside SQL), similarity semantics (raw cosine, not a probability), "never-verified ≠ verified", `source_type` shown as recorded, PDF/unsupported formats failing loudly, the SSRF controls and "route accepts ids, never URLs", `vector(768)` (new model/size ⇒ new migration), and all earlier "Do Not Change" lists below.

---
# Archive — Module 10 handoff (superseded where it conflicts with the Module 11 section above)

## Module Worked On
Module 10 — Scholarship Details + Sources

## Status
**PARTIALLY_COMPLETE.** Implemented. Verified only by tests that run without `node_modules`. **Not** lint-, typecheck-, build-, browser- or Supabase-verified: this session's sandbox could not install npm packages (registry returned HTTP 403), so no `node_modules` existed. Do not mark COMPLETE until the checklist below passes.

## Roadmap requirement (source of truth)
`docs/MODULES.md`: "Complete detail page, funding breakdown, requirements, dates, official URLs, last verified date and Pakistan-side section." (PRD FR-010, FR-011, FR-024.) Nothing was added beyond this.

## What Was Built
Extension of the existing public page `/scholarships/[id]` (Module 04). Rules: **ADR-032**.
- **Verification notice** (`VerificationNotice`): never verified / invalid / future date → "Not verified yet… treat as unconfirmed"; > 180 days → "may be out of date"; recent → "last verified …, can still change". Never says "confirmed".
- **Application phase badge + Key dates**: closed / upcoming / open (N days) / "Deadline not listed"; note that times and zones are not stored.
- **Funding breakdown** (tuition, stipend, accommodation, insurance, travel, application fee) with the existing careful funding explanation; **Eligibility**; **Requirements** grouped by type (deterministic order), each showing its source when the source is publicly visible.
- **Pakistan-side section** "For applicants in Pakistan": shows `scholarship_requirements` rows with `requirement_type = 'pakistan_side'`; rows without a recorded source are flagged unconfirmed; otherwise an honest "nothing recorded yet" state. **No Pakistani-authority guidance is hard-coded** (a static test enforces this).
- **Sources**: "Official links" (only the stored `official_*_url` columns + university site) and "Recorded sources" (rows exactly as stored; type never upgraded). All links http(s) only, host shown, `rel="noopener noreferrer"`, "(opens in a new tab)".
- In-page navigation, links back to `/scholarships` and `/matches`.
- Draft / archived / missing scholarships: identical 404 (RLS hides them; no status logic in app code). Invalid UUID: 404 before any query. DB failure: generic unavailable state.

## One approved-module behaviour change (explained in ADR-032 §6)
`src/lib/matching/eligibility.ts` now skips `pakistan_side` requirement rows. Without it, Pakistan-side process steps would have become mandatory "needs confirmation" checks and lowered students' statuses. One new regression test; ADR-031 otherwise unchanged.

## Files Created
`src/lib/public/detail.ts`; `src/components/scholarship/{detail-parts,requirement-list,sources-section,verification-notice}.tsx`; `tests/details/{run-unit.sh,detail.test.cjs,security-static.test.cjs}`.

## Files Modified
`src/app/scholarships/[id]/page.tsx` (recomposed; `generateMetadata`, 404/unavailable handling unchanged), `src/lib/public/types.ts` (+`sourceId` on `ScholarshipRequirement`), `src/lib/public/queries.ts` (+`source_id` in the requirements select and mapping), `src/lib/matching/eligibility.ts` (skip rule), `tests/matching/matching.test.cjs` (+1 test), `package.json` (+`test:details`), `docs/{PROGRESS,HANDOFF,DECISIONS,DATABASE}.md`.

## Files Deleted / Database / Dependencies
None deleted. **No migration** (still 4). No new dependency. `docs/DATABASE.md` §14 documents the `pakistan_side` convention and an SQL template with placeholders (no fake data).

## Tests Run (observed by Claude in this session, LOCAL only)
| Check | Result |
|---|---|
| `test:details` | 19 unit + 14 static pass |
| `test:matching` | 55 unit (54 + 1 new) + 22 static pass |
| `test:search` 20+11, `test:profile` 36, `test:documents` 43+22, `test:admin-scholarships` 37+25 | pass (regression) |
| Mutation checks (future date = verified; unsafe protocols allowed; stale threshold off by one; matching counts Pakistan-side rows; status filter added in app code) | each made the intended test fail; code restored and diffed identical |
| `tsc` over the changed files against **ambient stubs** for React/Next/lucide/cva (`--strict --noUnusedLocals`) | clean, and a deliberately injected property typo was caught. **This is NOT the project typecheck**: JSX prop types of shadcn components and Next route typing were not checked. |

Sandbox note: the global TypeScript here is newer than the repo's and rejects `tsc` + `tsconfig.json` on the command line (TS5112), so the existing `run-unit.sh` scripts were executed through a throw-away wrapper that injects `--ignoreConfig`. The repo scripts themselves are unchanged and follow the same pattern as the existing suites.

## NOT RUN (must be done before COMPLETE)
1. `npm ci`, `npx next typegen`, `npm run lint`, `npm run typecheck`, `npm run build` — expect possible small issues in the new TSX (stubs cannot prove JSX prop types or lint rules).
2. `npm run test:auth` (without `.env.local`), `npm run test:db`, `test:matching-ui`, `test:profile-ui`, and the new `npm run test:details` through the repo's own TypeScript.
3. Real browser check at ~1280px and ~390px: header nav wraps, "On this page" chips, two-column layout collapses, sticky aside, long URLs wrap (`break-all`), keyboard focus order, screen-reader text for new-tab links.
4. Real Supabase with real data (owner): as a guest and as a student open (a) an active scholarship with sources + requirements, (b) one never verified (expect the amber "Not verified yet" notice), (c) one verified > 6 months ago, (d) one with no URLs/sources/requirements (expect "Information not available." everywhere, no broken links), (e) a draft and an archived one by id (expect 404 for everyone, including the admin), (f) a past-deadline one (expect "Deadline passed"), (g) an invalid id like `/scholarships/abc` (404). Confirm the `scholarship_requirements?select=…,source_id` request succeeds on real PostgREST and that an inactive source is not shown or attributed.
5. Add a `pakistan_side` row (SQL template in DATABASE.md §14) with and without `source_id`; confirm the section and the "unconfirmed" flag, and that `/matches` statuses for that scholarship are unchanged.
6. Click every external link: each must land on the intended official page.

## Known Issues / Limitations
- No admin UI for requirement rows → Pakistan-side data (and any requirement data) is SQL/service-role only. Recommended next step for data readiness (not part of this module).
- Pakistan-side uses a convention in a free-text column; if it grows, give it a table/structure and remove the matching exception.
- `STALE_AFTER_DAYS = 180` is a display heuristic; the lower-priority-number-is-more-trusted assumption (ADR-026) is still unconfirmed.
- No RAG, mentor experiences, roadmap or AI assistant sections on the page (FR-010 lists them; they belong to Modules 11–17).
- Admins get no draft preview on this page.
- Pre-existing and unchanged: every route is dynamic (root layout reads the session); Module 05–09 live verification still outstanding.

## Next Module
After the checklist above passes: **Module 11 — RAG Knowledge Base** (`docs/MODULES.md`). Do not start it first. Module 11 will need real, verified source URLs from `scholarship_sources`, so the data-quality items above matter.

## Do Not Change
Keep detail logic pure and data-driven (no fabricated facts, no AI), keep "never verified ≠ verified", keep source types as recorded, keep http(s)-only external links, keep the anon client and RLS-only visibility for this page, keep the `pakistan_side` literal identical in `detail.ts` and `eligibility.ts`, and all earlier "Do Not Change" lists below.

---
# Archive — earlier handoffs

(Superseded where they conflict with the Module 10 section above.)

## Module Worked On
Module 09 — Eligibility + Matching

## Status
**PARTIALLY_COMPLETE.** Implemented and locally tested (including real-browser tests against the LOCAL mock). NOT verified against the real Supabase project. Not marked COMPLETE because essential verification (live data, owner browser check) has not happened.

## What Was Built
Authenticated `/matches` plus a pure, deterministic, AI-free engine. Full rules/methodology: **ADR-031** (read it before changing anything).
- Engine `src/lib/matching/`: `normalize.ts` (level/field/GPA/date parsing), `eligibility.ts` (checks + status), `explain.ts` (student-facing text), `profile-gaps.ts` (what profile data is missing), `rank.ts` (filter + sort), `params.ts` (URL options), `queries.ts` (the only Supabase code).
- Page `src/app/(protected)/matches/{page,loading}.tsx`, component `src/components/matches/match-card.tsx` (wraps the existing public `ScholarshipCard`).
- Header "Matches" link, dashboard "Your matches" card, `id="education"` anchor on the profile Education card (so "add education" links land on it).
- Statuses: Likely eligible / Possibly eligible / Not eligible / Insufficient information. **Missing information is never treated as ineligible.** No score or probability anywhere; only "N of M checks matched your profile".

## Eligibility rules (summary; details in ADR-031)
Degree level (mandatory; prerequisite ladder, completed vs in-progress); minimum GPA (mandatory when stated; proportional scale conversion, close calls = unknown); field of study (relevance only — a mismatch hides the scholarship by default but never makes anyone "not eligible"); requirement rows and English/eligibility summaries are shown as "needs confirmation"/"not checked". **Nationality is not evaluated** (no scholarship-side data exists).

## Matching methodology
Candidates = what the anonymous RLS view returns (active only) via ONE bounded query with embedded requirements (limit 501); the engine also re-checks `status === 'active'` (fail closed). Closed scholarships hidden by default (`?closed=1`), other-field/level hidden by default (`?show=all`), draft/archived never shown for any user. Order: status tier → open before closed → more checks met → nearest deadline → name → id. Pagination 12/page in memory.

## Files Created
`src/lib/matching/{types,normalize,eligibility,explain,profile-gaps,rank,params,queries,index}.ts`; `src/app/(protected)/matches/{page,loading}.tsx`; `src/components/matches/match-card.tsx`; `tests/matching/{run-unit.sh,matching.test.cjs,security-static.test.cjs,run-ui.sh,ui.mjs}`.

## Files Modified
`src/components/layout/site-header.tsx`, `src/app/(protected)/dashboard/page.tsx`, `src/components/profile/education-section.tsx` (anchor id only), `tests/auth-mock/{mock-supabase-auth.mjs,e2e.mjs}` (anon `scholarships` endpoint, seeding hooks, section L4: 26 checks), `package.json` (`test:matching`, `test:matching-ui`), `docs/{PROGRESS,HANDOFF,DECISIONS,DATABASE}.md`. No Module 02–08 behaviour changed.

## Files Deleted
None.

## Database Changes
None. No migration. Gaps documented in DATABASE.md §13.

## Tests Run (observed by Claude, LOCAL only)
| Check | Result | Target |
|---|---|---|
| `npm run lint`, `npm run typecheck` (after `npx next typegen`), `npm run build` | pass (`/matches` listed as dynamic; no service key in `.next/static`) | local |
| `npm run test:auth` | 159 + 5 + 4 + 6 pass (26 new checks in L4) | LOCAL MOCK (REST emulation is not Postgres/RLS) |
| `npm run test:db` | 242/242 (unchanged) | LOCAL Postgres 16 + shim |
| `npm run test:matching` | 54 unit + 22 static pass | pure functions / source text |
| `npm run test:matching-ui` | 41 pass (Chromium, 1280px and 390px, keyboard focus, states, forged-id URL, A/B isolation) | LOCAL MOCK |
| regression: `test:profile` 36, `test:profile-ui` 32, `test:documents` 43+22, `test:admin-scholarships` 37+25, `test:search` 20+11 | pass | local |
Mutation checks (proving the tests bite): letting drafts through, ignoring `not_eligible`, never hiding closed, passing sub-minimum GPA, treating missing data or requirement rows as met/not-met, importing the service client and reading an id from the URL each made tests fail; restored afterwards.
Run `test:auth` WITHOUT `.env.local`; `test:matching-ui`/`test:profile-ui` need Playwright (`NODE_PATH`, `PLAYWRIGHT_BROWSERS_PATH`).

## Mapping to the prompt's test list
Eligibility cases (all met, one mandatory not met, unknown, incomplete requirements, incomplete profile, optional missing, invalid data), matching cases (relevant, unrelated, multiple, draft, archived, expired, missing deadline, sorting) and security cases (guest redirect, no cross-student data, forged profile id ignored) are each covered by named tests in `tests/matching` and `tests/auth-mock/e2e.mjs` L4. **Caveat:** "students cannot retrieve another student's data" is proven at the application level on the mock (own session id only; RLS emulated). The database boundary itself is the existing `test:db` suite (profiles/education own-row policies, 242 checks) — no new policies were needed or added. "Public scholarship visibility remains intact" is covered by `test:db` (unchanged) and by the app-level exclusion tests.

## Known Limitations
- No live verification. `queries.ts` has never run against real PostgREST: the embedded `scholarship_requirements(...)` select, `countries!inner(...)` and the `or=deadline.is.null,deadline.gte.<date>` filter are the same patterns Module 04/08 use, but verify with real data.
- Matching quality depends on consistent free-text `degree_level`/`field`; unknown wording → level `unknown`, field looks unrelated (hidden but revealable).
- No nationality / age / language / preference logic (no data on either side). English requirement is displayed, not evaluated.
- In-memory evaluation of ≤500 scholarships per request; truncation notice shown beyond that. Revisit with SQL pre-filtering if the dataset grows.
- Admins see the same public-only list here (by design); the page does not offer "preview drafts".
- `not_eligible` scholarships are listed (with reasons) rather than hidden, so students understand why; a "hide not eligible" toggle was not added.
- Pre-existing: every route is dynamic; Module 05–08 live verification still outstanding.

## Manual Verification Remaining (owner, real Supabase, real data)
1. Sign in as a student with a Bachelor's (with CGPA, field, graduation date) → `/matches` lists published Master's scholarships in that field with sensible statuses and reasons.
2. Guest → `/matches` redirects to `/login?next=/matches`.
3. Change the profile (lower the CGPA below a scholarship's minimum; remove the CGPA; remove all education) and reload: statuses move to Not eligible / Possibly eligible / the "Add your education" state; the profile links open the Education card.
4. A draft and an archived scholarship (create/unpublish via `/admin/scholarships`) never appear, including when signed in as the admin. A scholarship with a past deadline appears only with "Include closed". One without a deadline shows "Deadline not listed".
5. "Show N more in other fields or levels" reveals the hidden ones; cards link to the correct `/scholarships/[id]`.
6. With two real students, confirm each sees only their own CGPA/field in the explanations; adding `?user_id=<other>` to the URL changes nothing.
7. Check on a real phone and desktop; a request failure shows the generic "temporarily unavailable" message.
8. Review a few scholarships' wording of `degree_level`/`field` in the real dataset and confirm the engine interprets them as expected.

## Next Module
Module 10 — Scholarship Details + Sources (per `docs/PROGRESS.md`/`MODULES.md`). Not started. Recommended before it: finish the pending live verifications (Modules 05–09) so later modules build on verified ground.

## Do Not Change
Keep the engine pure (no I/O/AI), "missing data ≠ ineligible", the three public URL options only, the anon client for scholarships and the cookie-bound client + session id for student data, the engine-level `status === 'active'` re-check, no service-role use on `/matches`, and all earlier "Do Not Change" lists (Module 02–08 sections below).

---
# Archive — Module 09 and earlier handoffs

(Superseded where they conflict with the Module 09 section above.)

## Module Worked On
Module 08 — Search + Filters

## Status
**PARTIALLY_COMPLETE.** Implemented and locally tested. NOT browser-verified. NOT verified against real Supabase/PostgREST with real data.

## What Was Built
Search and filtering on the existing `/scholarships` page (details in PROGRESS.md "Module 08 — details" and ADR-030). Reused: the whole Module 04 page, form, card, empty/unavailable states, pagination, URL state. New: multi-word keyword search (incl. university and country names), university filter, deadline-window filter, active-filter chips, Reset filters, auto-submit on change, result range, in-page error state, `search` URL alias.

## Files Created
`src/components/public/filter-auto-submit.tsx`; `tests/search/{run-unit.sh,filters.test.cjs,security-static.test.cjs}`.

## Files Modified
`src/lib/public/{filters,queries,types}.ts`, `src/app/scholarships/page.tsx`, `tests/db/rls.test.sql` (+27 checks), `package.json` (`test:search`), `docs/{PROGRESS,HANDOFF,DECISIONS}.md`. No Module 07 file changed.

## Database Changes
None (no migration; indexes deliberately not added — see ADR-030).

## Tests Run (observed by Claude, local only)
`lint` pass; `typecheck` pass; `build` pass; `test:auth` 133 (118+5+4+6); `test:db` 242/242 (215 baseline + 27 new; LOCAL Postgres 16 + shim, mirrors the queries as SQL under the `anon` role; it is NOT PostgREST and NOT live Supabase); `test:search` 20 unit + 11 static; `test:profile` 36; `test:documents` 43 + 22; `test:admin-scholarships` 37 + 25. HTTP smoke on `next start` without Supabase: `/scholarships` with valid, malformed and injection-style params returned 200 and the unavailable state. Not run: browser tests (no Playwright/Chromium available), `test:profile-ui`, any live check. There is no pre-existing failure.

## Known Limitations
See ADR-030 "Known limits". The app-level query code (`getScholarships`) is not executed against a real PostgREST in any test; correctness of the generated `or()` filters rests on the pure-function tests plus manual verification.

## Manual Verification Remaining (owner, with real data)
1. `/scholarships` loads and lists only published scholarships. 2. Search a word from a name, provider, field, a university name and a country name; each finds the expected rows. 3. Two-word search narrows results. 4. Each filter (country, university, degree, field, funding, deadline window, hide closed) works alone and combined with search. 5. Changing a select updates the results and URL; Reset filters restores everything; a chip's × removes only that filter. 6. Refresh and back/forward keep the state; paste the URL in a new tab. 7. A search with no match shows the empty state. 8. Draft and archived scholarships never appear (search their exact title). 9. Pagination with >12 results keeps filters. 10. Check at phone width.

## Next Module
Module 09 — Eligibility + Matching (after the verification above).

---
## Module 07 handoff (previous session; kept for reference)

## Module Worked On
Module 07 — Scholarship Data (admin management + curated dataset workflow)

## Status
**PARTIALLY_COMPLETE.** Code implemented; local checks pass; admin UI NOT browser-verified; NOT verified against live Supabase; NO curated dataset exists.

## What Was Built
Admin scholarship management under `/admin/scholarships` (list with pagination/search/status filter, create as draft, edit, publish/unpublish/archive/restore, mark verified, sources CRUD, guarded delete, JSON import as drafts). Server Actions in `src/lib/admin-scholarships/actions.ts` authenticate, require `profiles.role = admin`, validate with an allow-list, use the cookie-bound client (RLS still authoritative), return generic errors and write `admin_actions` audit rows. See ADR-029 and `docs/DATA_IMPORT.md`.

## Files Created
`src/lib/admin-scholarships/{validation,import,types,queries,actions}.ts`; `src/components/admin-scholarships/{scholarship-form,confirm-action-button,sources-panel,import-form}.tsx`; `src/app/(protected)/admin/{page.tsx,scholarships/{page,loading}.tsx,scholarships/new/page.tsx,scholarships/import/page.tsx,scholarships/[id]/page.tsx}`; `tests/admin-scholarships/{run-unit.sh,validation.test.cjs,security-static.test.cjs}`; `docs/DATA_IMPORT.md`.

## Files Modified
`src/app/(protected)/dashboard/page.tsx` (admin-only link), `tests/db/rls.test.sql` (+27 Module 07 checks), `package.json` (`test:admin-scholarships`), `docs/{PROGRESS,HANDOFF,DECISIONS}.md`. Public pages and `src/lib/public/*` are unchanged.

## Database Changes
None. No migration. DATABASE.md unchanged.

## Tests Run (observed by Claude in this session; local only)
- `npm ci`, `next typegen`: ok. `npm run lint`: pass. `npm run typecheck`: pass. `npm run build`: pass (admin routes listed as dynamic).
- `npm run test:auth`: 118 + 5 + 4 + 6 = 133 pass (mock Supabase Auth; covers proxy-level `/admin` access for guest, student, mentor, admin).
- `npm run test:db`: 215/215 (188 baseline + 27 new) on LOCAL Postgres 16 + Supabase shim. NOT live Supabase.
- `npm run test:profile`: 36/36. `npm run test:documents`: 22/22 static (+43 unit step reported no failure).
- `npm run test:admin-scholarships`: 37 unit + 25 static pass. The static checks were shown to fail when the admin check was altered and when a service-role import was injected.
- Baseline before changes: lint/typecheck passed; test:auth 133, test:db 188/188.
- NOT RUN: `test:profile-ui`, `test:documents-live`, browser check of admin pages, any live Supabase check, runtime tests of the admin Server Actions (they are verified by static structure + DB-level policy tests, not by executing them against a mock). Public-visibility behaviour is covered at the RLS level (guest sees only active); the public query code is unchanged and was not re-tested at runtime.

## Known Issues / Limitations
No dataset; no admin UI for countries/universities/requirements; no unique constraint for duplicates (app-level guard only); audit write is best-effort; no currency for fees; `degree_level`/`field` are free text so inconsistent wording fragments public filters; app-level checks (university-in-country, duplicate) are not DB-enforced.

## Manual Verification Remaining (owner)
Sign in as admin on the real project; create → edit → publish → confirm it appears at `/scholarships` and `/scholarships/[id]`; unpublish/archive → confirm 404 for guests; try as student/mentor → redirected; try deleting a scholarship with an application → refused; run a small import of REAL verified records.

## Next Module
Module 08 — Search + Filters (after Module 07 is verified and a dataset exists).

---
## Module 06 handoff (previous session; kept for reference)

## Module Worked On
Module 06 — Document Vault

## Status
**PARTIALLY_COMPLETE — implemented; only the new unit + static checks were run. NOT_VERIFIED against the real Supabase project. Regression suites, lint, typecheck and build were NOT RUN.**

Why: this authoring session had no `node_modules`, the npm registry returned 403 and there was no Supabase network/credentials, so nothing that needs the installed project could run. Do not treat the code as type-checked or built until `npm install && npx next typegen && npm run lint && npm run typecheck && npm run build` pass. The Next.js docs in `node_modules/next/dist/docs/` (required reading by AGENTS.md) could not be read; the Next-specific code follows the patterns already used by Modules 02/05 (Server Actions, `await params`, `redirect`).

## What Was Built
- `/documents` (inside `(protected)`, `requireUser()` re-checked in the page): header + privacy note, upload form (file picker, optional document type, limits shown: PDF/JPEG/PNG/DOCX, 10 MB), server-rendered list (file name, document type, format, size, upload date), View / Download links, two-step delete, empty / unavailable / loading states.
- `uploadDocument` / `deleteDocument` Server Actions (`src/lib/documents/actions.ts`); `GET /documents/[id]/file[?download=1]` route returning a 302 to a 60-second signed URL.
- Pure validators (`src/lib/documents/validation.ts`): size, extension, browser-MIME consistency, magic-byte signature (PDF `%PDF-` in first 1 KB, JPEG, PNG, DOCX = ZIP containing `[Content_Types].xml` + `word/document.xml`), display-name sanitiser (strips directories/control/bidi chars, truncates by code point keeping the extension), server-side path builder, defensive path check.
- Header "Documents" link and a dashboard card.

## Files Created
`src/lib/documents/{constants,types,validation,queries,actions}.ts`; `src/components/documents/{upload-form,delete-document-button,document-list}.tsx`; `src/app/(protected)/documents/{page,loading}.tsx`; `src/app/(protected)/documents/[id]/file/route.ts`; `tests/documents/{run-unit.sh,validation.test.cjs,security-static.test.cjs,live-verify.mjs}`.

## Files Modified
`next.config.ts` (`experimental.serverActions.bodySizeLimit = "11mb"`), `package.json` (scripts `test:documents`, `test:documents-live`), `src/components/layout/site-header.tsx` (Documents link), `src/app/(protected)/dashboard/page.tsx` (documents card), `docs/{PROGRESS,DECISIONS,DATABASE,HANDOFF}.md`.

## Database / Storage Changes
None. Zero migrations (asserted by the static test). Module 03 table, grants, RLS and the private `documents` bucket + 4 owner-only policies are untouched. Module 03 `rls.test.sql` already covers cross-user select/update/delete/insert on `documents`, re-parenting, path-in-own-folder, MIME/size CHECKs and `storage.objects` insert/select isolation; no SQL tests were added.

## Security Decisions (details in ADR-028)
- Identity only from `auth.getUser()`; the browser sends file + optional allow-listed type (+ record id for delete). Static test asserts the actions read only `file`, `document_type`, `id`.
- Cookie-bound anon client everywhere; service-role client/`env.server.ts` not imported (static test, incl. "no client component imports server-only/admin").
- Path = `<session user id>/<random uuid>.<ext of the VERIFIED type>`; original name never in the path; stored MIME derived server-side; DB + Storage constraints remain the final boundary.
- Signed URL only from the authenticated route, 60 s, after an own-row lookup (`user_id` filter + RLS); generic 404 for unknown/foreign/malformed ids; `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; links are plain `<a>` (no prefetch). No `getPublicUrl` anywhere (static test).
- Delete: object first, then row (rationale in ADR-028). Upload: object removed if the row insert fails.
- Raw Supabase/Storage errors are never returned; only a code/status/name is logged (static test).
- `processing_status` is not shown (nothing processes documents yet).

## Tests Performed (exact results)
- `bash tests/documents/run-unit.sh`: **43 passed, 0 failed** (valid PDF/JPEG/PNG/DOCX; exactly 10 MB ok, 10 MB+1 rejected; empty; unsupported extensions incl. `.pdf.exe`, no extension, dotfile; unsupported/mismatched browser MIME; HTML/EXE/ZIP renamed to .pdf/.png/.jpg/.docx rejected; PDF marker past 1 KB rejected; `../../x.pdf`, `/other-user/x.pdf`, `..\\x.pdf` sanitised; control/bidi chars; Unicode; 500-char and emoji names; path builder uniqueness / UUID-only / lower-casing; `isStoragePathForUser` traversal cases; type allow-list). Also checked by hand against genuine PDF/PNG/JPEG/python-docx files (accepted) and a GIF (rejected).
- `node tests/documents/security-static.test.cjs`: **22 passed, 0 failed** (and shown to fail when violations were injected). This is a source-text check, not a behavioural test.
- A syntax-level `tsc` pass over the new TS/TSX found 0 syntax errors (module-resolution errors were expected and ignored). This is NOT a typecheck.
- NOT RUN: `npm run lint`, `typecheck`, `build`, `test:auth`, `test:db`, `test:profile`, `test:profile-ui`, `test:documents-live`.
- NOT WRITTEN (still required by the Module 06 prompt): mock-e2e coverage (guest redirect for `/documents` and the file route; student can load `/documents`; A/B isolation through the app with forged ids; upload/delete through the Server Actions against the mock), and a browser UI test like `tests/profile/ui.mjs`. The mock server (`tests/auth-mock/mock-supabase-auth.mjs`) has no Storage emulation yet; adding it was out of reach without being able to run it.

## Live Verification (NOT_VERIFIED) — must do before marking COMPLETE
Automated (Storage + RLS layer, anon key + two real users, no service role, self-cleaning):
`NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… TEST_USER_A_EMAIL=… TEST_USER_A_PASSWORD=… TEST_USER_B_EMAIL=… TEST_USER_B_PASSWORD=… npm run test:documents-live`
It has never been executed; expect to debug it on first run. It covers: A uploads PDF + PNG and lists them; signed URL works and expires; public/unauthenticated URLs do not serve the file; >10 MB, `text/html`, `image/gif` rejected; DB CHECKs; B cannot list/read/sign/download/update/re-parent/insert-as-A/upload-into-A's-folder/delete A's objects or rows; A's data unchanged; A deletes one (row + object gone); cleanup.
Manual through the real app (the script does not exercise the UI/Server Action/route):
- U1 A signs in, opens `/documents` (empty state). U2 uploads a PDF and a JPEG/PNG; both appear with correct name/type/size/date. U3 View opens inline (PDF/image); Download saves with the display name; DOCX uploads and downloads. U4 Delete → "Yes, delete" removes the row; confirm in the dashboard Storage browser that the object is gone and the other remains.
- U5 Upload rejections in the UI: a >10 MB file, `.html`, an HTML file renamed `.pdf`, a GIF, an empty file — each shows the generic message. U6 A file of ~9.9–10 MB uploads successfully (checks the Server Action body limit and the proxy body buffer; see Known Issues).
- U7 B signs in: `/documents` is empty. U8 B opens `/documents/<A's id>/file` → generic 404. U9 B forges A's id in the delete form's hidden input → "could not be found"; A's document unchanged. U10 guest opens `/documents` and `/documents/<id>/file` → redirected to `/login`.
- U11 `profiles.role` unchanged for A and B. U12 Remove all test documents (rows and objects).
Also still owed from Module 05: its own live checklist.

## Known Issues / Limitations
- Nothing here has been type-checked, linted or built. Most likely first-run problems: typing of the Storage client calls (`exists`, `remove`, `createSignedUrl` options), the Next 16 route-handler/Server-Action specifics, the `bodySizeLimit` key.
- **Request body limits (UNVERIFIED):** Server Actions default to 1 MB (raised to 11 MB in `next.config.ts`). In recent Next versions the proxy (`src/proxy.ts`, which matches all non-static paths) may also buffer request bodies up to a default of about 10 MB, which could truncate an upload close to the limit. If U6 fails, consult the Next docs for the proxy body-size option (the config key name could not be verified here, so none was added) or exclude the upload from the proxy matcher after reviewing the auth consequences. Hosting platforms with a smaller request cap than ~10 MB will also reject large uploads before the action runs.
- A double-submit from two tabs can create two documents (one tab is guarded). Orphaned objects are possible only if an upload insert AND its rollback both fail (logged by code only).
- No rename/edit of metadata, no pagination (list capped at 500), no upload progress bar (Server Action), no malware scanning, DOCX detection is structural only.
- `document_type` list is an app-level choice (ADR-028); the DB accepts any text.
- Inline "View" of a PDF/image is served from the Supabase Storage origin via the signed URL (a different origin from the app).

## Do Not Change
Everything in the Module 05, 04, 03 and 02 "Do Not Change" lists still applies. Additionally: keep document operations on the cookie-bound client (never service role), keep the storage path server-generated, keep signed URLs short-lived and produced only by the authenticated file route, keep the bucket private with the four owner-only policies, never create a public URL, and keep `DOCUMENT_TYPES` / allowed formats aligned with the DB CHECKs and bucket allow-list.

## Next Module
Finish Module 06 first: install dependencies, run `lint` / `typecheck` / `build` and all regression suites, write the missing mock-e2e and browser tests, run `test:documents-live` and the manual checklist, fix what they find, then mark COMPLETE. After that: **Module 07 — Scholarship Data** (admin CRUD and curated dataset).

---
# Archive — Module 05 handoff

## Module Worked On
Module 05 — Student Profile

## Status
**PARTIALLY_COMPLETE — implemented and verified locally; NOT_VERIFIED against the real Supabase project.**

Observed passing in this session: `npm run lint`, `npm run typecheck` (run `npx next typegen` first on a fresh checkout), `npm run build`, `npm run test:auth` (118+5+4+6), `npm run test:db` (188/188), `npm run test:profile` (36/36), `npm run test:profile-ui` (32/32, headless Chromium). Not possible here: any call to the real hosted Supabase project (no credentials, no network route). Module 04 is recorded COMPLETE on the owner's statement; this session additionally saw its static checks and suites pass and the public routes return 200 on the mock.

## What Was Built
- `/profile` (inside `(protected)`): completion card, personal information (full name, nationality, city), education CRUD, experience CRUD, empty/loading/error/success states, two-step delete confirmation. `loading.tsx` added; no root loading file.
- Server Actions (`src/lib/profile/actions.ts`): `updateProfile`, `saveEducation`, `deleteEducation`, `saveExperience`, `deleteExperience`. Each: validate on the server, resolve the user via `auth.getUser()`, derive `profile_id` from the caller's own profile, write through the cookie-bound client, rely on RLS, log DB error codes only, return generic messages.
- Pure validators (`src/lib/profile/validation.ts`) mirroring DB constraints; allow-listed `level` / `experience_type`; completion indicator derived from existing data (`completion.ts`).
- Header shows a "Profile" link when signed in; the dashboard has a "Go to my profile" card. Public nav is unchanged.
- Date of birth is deliberately NOT collected (ADR-027).

## Files Created
`src/lib/profile/{types,validation,completion,format,queries,actions}.ts`; `src/components/profile/{fields,form-buttons,delete-button,profile-form,education-section,experience-section,completion-card}.tsx`; `src/app/(protected)/profile/{page,loading}.tsx`; `tests/profile/{run-unit.sh,validation.test.cjs,run-ui.sh,ui.mjs}`.

## Files Modified
`src/components/layout/site-header.tsx` (Profile link), `src/app/(protected)/dashboard/page.tsx` (profile card), `tests/db/rls.test.sql` (+21 Module 05 checks), `tests/auth-mock/mock-supabase-auth.mjs` (in-memory REST emulation for profiles/education/experiences with ownership + column-grant emulation; the old profiles lookup behaviour is preserved), `tests/auth-mock/e2e.mjs` (section L3), `package.json` (scripts `test:profile`, `test:profile-ui`), `docs/{PROGRESS,DECISIONS,HANDOFF}.md`.

## Database Changes
None. No migration. Existing Module 03 schema, grants and RLS were sufficient and are untouched.

## Security Considerations
- Identity comes only from the server session. The forms send no user/profile/owner id; edit/delete send only the record id, and RLS makes a foreign id match zero rows (the app reports "could not be found"). Tested in the browser by swapping the hidden id to another user's record.
- Only whitelisted columns are ever written; `role`, `user_id`, `id`, `profile_id` (on update) are never sent and have no client grant. Extra form fields (`role`, `user_id`, ...) are ignored (tested).
- Service-role client, `env.server.ts` and `supabase/admin.ts` are not imported by any profile code or client component (grep-checked). Page HTML contains no server env/service-role text (tested).
- Raw DB errors are never shown; the page degrades to a generic "temporarily unavailable" state (tested by making the mock REST fail).

## Tests Performed
See Status. New: `rls.test.sql` Module 05 block (own profile update, role unchanged, length checks, education/experience insert/update/delete, no `profile_id` re-parenting, cgpa/date constraints, cross-user denial); `e2e.mjs` L3 (render, validation never reaches DB, tampered fields ignored, whitelisted PATCH body, user B isolation, DB failure, guest redirect); `tests/profile/*`.
Test infrastructure caveat: `test:profile-ui` needs Playwright resolvable via `NODE_PATH` (default `/opt/node-tools/node_modules`; exits 2 and skips if absent) and ports 3200/54321. The mock REST layer is NOT Postgres; it emulates ownership only. Do not run `pkill -f "next start"`-style commands from inside a shell whose own command line contains that text (it kills the shell).

## Live Verification (NOT_VERIFIED) — must do before marking COMPLETE
With real credentials in `.env.local`, using two real users A and B:
1. A: save profile fields; add, edit and delete an education and an experience record. Confirm rows in the dashboard.
2. B: confirm `/profile` shows none of A's data; forge A's education/experience id in an edit and a delete (as in `tests/profile/ui.mjs`) and confirm both are refused and A's rows are unchanged.
3. Confirm `profiles.role` is still `student` for both. Do not leave test rows in the project.
4. Confirm a fresh signup gets a profile row (trigger) so `/profile` loads instead of the "temporarily unavailable" state.

## Known Issues / Limitations
- `education.cgpa`/`cgpa_scale` are `numeric(4,2)`: a scale of 100 (percentages) is rejected with a message. Needs a new migration if wanted (ADR-027).
- `education.level` / `experiences.experience_type` are free text in the DB; the app enforces a fixed list, the DB does not.
- MODULES.md lists research, English-test, preferences and goals for Module 05, but the schema has no such columns/tables. Not invented; they need a schema decision (probably with Module 09, which needs IELTS/field/country preferences for matching).
- The education/experience forms are client-toggled, so they need JavaScript. The personal-information form also works as a plain form POST.
- `/scholarships/not-a-uuid` and `/countries/BAD_SLUG` returned HTTP 200 in the smoke test (Module 04 routes with `loading.tsx`; likely streamed not-found). Not investigated and not changed.
- No pagination on education/experience lists (not expected to be large).
- Completion rules are a simple heuristic (5 required items, experience optional) and may change with Module 09.

## Do Not Change
Everything in the Module 04, 03 and 02 "Do Not Change" lists still applies. Additionally: keep profile writes on the cookie-bound client (never service role), keep ownership derived server-side, and keep the column whitelist in `validation.ts` aligned with the grants in `20261001000300_rls_policies.sql`.

## Next Module
Complete the live verification above, then **Module 06 — Document Vault.**

---

# Archive — Module 04 handoff

## Module Worked On
Module 04 — Landing & Public Pages

## Status
**PARTIALLY_COMPLETE — implemented, but NOT verified.**

The session sandbox could not install npm packages (every registry request returned HTTP 403), so there was no `node_modules`. As a result **none of these were run: `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:auth`, `npm run test:db`, or any manual/security smoke test.** The only check performed was a syntax-level `tsc` pass using a global TypeScript without React/Next/Supabase types: it reported no syntax errors, and the only errors in the data layer were missing-package ones. That is NOT a typecheck. Do not mark Module 04 COMPLETE until the checklist below passes.

Module 03: the project owner stated in the Module 04 prompt that Module 03 was verified against the real hosted Supabase project. PROGRESS.md now records Module 03 as COMPLETE on that basis (owner-reported, not observed by Claude; live checklist results were not recorded).

## What Was Built
- Landing page (`/`): hero with an illustrative journey preview (clearly labelled, no fake scholarships), how it works, discovery, funding explainer, countries (from DB, with empty state), AI assistance (student stays in control; AI never submits), mentor community, final CTA.
- Public header: desktop nav + mobile menu (the only new client component), using existing `/login` and `/signup`. Footer with only existing routes.
- `/scholarships`: server-rendered GET filter form (search, country, degree, field, funding, hide closed, sort), pagination (12/page), empty/unavailable states.
- `/scholarships/[id]`: funding, eligibility, requirements grouped by type, key dates, official sources, "Apply on Official Website" (links only to the stored URL), "Information not available." for missing values.
- `/countries`, `/countries/[country]`: countries with active-scholarship counts; country page lists scholarships and universities.
- `/mentors`: introduction, official-vs-personal-experience distinction, verified-mentor count only (ADR-024).
- Per-route `loading.tsx` and `not-found.tsx`; static and dynamic (`generateMetadata`) SEO metadata.
- Invalid ids/slugs are rejected (UUID / slug validation) before any DB call and return 404; DB errors surface through the existing root `error.tsx` with a generic message.

## Files Created
`src/lib/supabase/public.ts`; `src/lib/public/{types,format,filters,queries}.ts`; `src/lib/config/navigation.ts`; `src/components/ui/{badge,skeleton}.tsx`; `src/components/public/{funding-badge,scholarship-card,country-card,states,skeletons,page-header}.tsx`; `src/components/layout/mobile-nav.tsx`; `src/app/scholarships/{page,loading,not-found}.tsx`; `src/app/scholarships/[id]/{page,loading}.tsx`; `src/app/countries/{page,loading,not-found}.tsx`; `src/app/countries/[country]/{page,loading}.tsx`; `src/app/mentors/page.tsx`.

## Files Modified
`src/app/page.tsx` (replaced the Module 01 placeholder), `src/components/layout/{site-header,site-footer}.tsx`, `docs/{PROGRESS,DECISIONS,HANDOFF}.md`.

## Files Deleted / Migrations / Dependencies
None. No migrations (existing schema and RLS were sufficient). No new dependencies. No RLS, grant, auth, proxy, or test changes.

## Security Notes
- Public reads use the cookie-less anon client; service-role key is not used anywhere in Module 04; `server-only` guards the data layer.
- Queries select explicit columns; `content_hash`, `user_id`, drafts and archived scholarships are never read or shown (RLS also hides drafts/archived).
- Header auth behaviour is unchanged (`Log in` / `Sign up` or `Dashboard` / `Log out`), so the Module 02 e2e header assertions should still hold, but this was not run.

## Must Do Before Marking Module 04 COMPLETE
1. On a machine with network access: `npm ci`, then `npm run lint`, `npm run typecheck` (run `npx next typegen` first if route types are missing), `npm run build`. Fix anything that surfaces (most likely candidates: Supabase untyped-client typings in `queries.ts`, lint rules on the new components).
2. `npm run test:auth` (without `.env.local`) and `npm run test:db`. The auth suite hits `/` and `/mentors` against a mock that has no REST API: both pages are written to degrade gracefully (`loadSoft`), please confirm they return 200.
3. Seed at least one `active` scholarship, country and university in the real project (Module 07 owns the real dataset; do not commit fake records) and smoke test as guest and signed-in user: `/`, `/scholarships` (each filter + pagination), `/scholarships/<valid-uuid>`, `/scholarships/<invalid>`, `/countries`, `/countries/<valid>`, `/countries/<invalid>`, `/mentors`, `/login`, `/signup`.
4. Confirm a `draft` scholarship id returns 404 for a guest, and that mobile menu opens/closes (button, Escape, link click).
5. Verify the embedded-resource queries against real PostgREST: `countries!inner(...)` with `.eq("countries.slug", ...)`, and the embedded count `scholarships(count)` under RLS.

## Known Issues / Limitations
- Routes are still dynamic (header reads session cookies). See ADR-025 for the recommended fix; public data code is already cookie-free.
- Root `src/app/error.tsx` (Module 01) takes a prop named `retry`; confirm the "Try again" button works on your Next version (not changed here).
- Schema gaps surfaced on the detail page: no application-process field, no fee currency, requirements are grouped by free-text `requirement_type`; no Pakistan-side section (Module 10).
- `/mentors` does not list individuals (ADR-024).
- Source ordering assumes lower `priority` = more trusted (ADR-026).
- No tests were added for Module 04 (nothing could be executed). Consider adding public-route checks to `tests/auth-mock/e2e.mjs` once a baseline run is green.
- `scholarship_sources.last_verified_at` and `scholarships.last_verified_at` are shown as stored; there is no freshness warning logic yet.

## Do Not Change
Everything in the Module 03 and Module 02 "Do Not Change" lists below still applies. Additionally: keep public pages on `createPublicClient()` (never the cookie-bound or service client), keep explicit column selects, and keep "Information not available." instead of inventing values.

## Next Module
After Module 04 is verified and flipped to COMPLETE: **Module 05 — Student Profile.** Do not start it before the checklist above passes.

---

# Archive — Module 03 handoff

## Module Completed
Module 03 — Database & Security

## Status
**PARTIALLY_COMPLETE — implemented and verified on LOCAL Postgres only; NOT applied to or verified on a real Supabase project.**

All four migrations apply cleanly and the RLS/security suite passes (167/167) on a local PostgreSQL 16 with a small Supabase shim (`tests/db/shim.sql`). The sandbox cannot reach `*.supabase.co`, so the migrations were never run against the real project and Supabase-specific behavior (hosted `storage.objects` policy creation, the Storage API enforcing the bucket's size/MIME limits, real GoTrue + PostgREST + signup trigger) is unverified. Module 03 should be flipped to COMPLETE only after the "Live verification checklist" below passes on the real project (see Known Issues). Module 02 remains COMPLETE (previously verified manually on real Supabase); its role source changed in this module and must be re-smoke-tested live.

## What Was Built
- Permanent role architecture: `public.profiles.role` replaces the temporary `app_metadata.role` (ADR-018/019).
- Automatic `student` profile for every new Auth user (DB trigger on `auth.users`), backfill for existing users.
- Core schema (14 tables), relationships, justified indexes, RLS on every table, least-privilege column grants.
- Private `documents` storage bucket with owner-only policies.
- `public.set_user_role()` (service-role-only) + append-only `admin_actions` audit log.
- Module 02 auth code switched to the profiles-based role; Module 02 mock/e2e suite extended.
- `npm run test:db` security suite.

## Tables Created
`profiles`, `education`, `experiences`, `documents`, `countries`, `universities`, `programs`, `scholarships`, `scholarship_sources`, `scholarship_requirements`, `applications`, `application_tasks`, `mentors`, `admin_actions`.
Deliberately NOT created (later modules, ADR-021): `scholarship_documents`, RAG tables/pgvector, `application_documents`, `application_drafts`, `mentor_stories/timelines/answers`, `reports`, `ai_*`.

## Migrations Created (`supabase/migrations/`, apply in order)
1. `20261001000100_profiles_and_roles.sql` — `set_updated_at()`, `profiles`, role-guard trigger, `handle_new_user()` trigger on `auth.users`, backfill, `current_user_role()`, `is_admin()`, `admin_actions`, `set_user_role()`.
2. `20261001000200_core_tables.sql` — remaining tables, constraints, indexes, `updated_at` triggers.
3. `20261001000300_rls_policies.sql` — `owns_profile()`, `owns_application()`, RLS enable on all 14 tables, grant reset + minimal/column grants, all policies.
4. `20261001000400_storage_documents.sql` — `documents` bucket + `storage.objects` policies.

## RLS Policies Created
- **profiles:** select own; select all (admin); update own (columns `full_name, nationality, city, date_of_birth` only). No client insert/delete.
- **education / experiences:** select/insert/update/delete own (via `owns_profile`); admin select.
- **documents:** select/insert/update/delete own. **No admin policy** (restricted).
- **countries / universities / programs:** public select; admin all.
- **scholarships:** public select where `status='active'`; admin all.
- **scholarship_sources:** public select where source `active` and scholarship `active`; admin all. **scholarship_requirements:** public select for active scholarships; admin all.
- **applications:** select/update/delete own; insert own only for `active` scholarships; admin select.
- **application_tasks:** all own via `owns_application`; admin select.
- **mentors:** public select where `verified`; select/insert/update/delete own (claim columns only; status is service-controlled); admin select.
- **admin_actions:** admin select; admin insert only with `admin_user_id = auth.uid()`; no update/delete.
- **storage.objects (`documents` bucket):** select/insert/update/delete only when first path folder = `auth.uid()`.
- Column-level grants additionally make `role`, ownership keys, `verification_status`, `verified_at`, `processing_status`, `extracted_text_reference` unwritable by clients.

## Storage Changes
Private bucket `documents` (`public=false`, 10 MB limit, PDF/JPEG/PNG/DOCX). Path convention `<user_id>/<file>`. `public.documents` CHECKs mirror path/MIME/size. No admin policy; any admin access must be an explicit server-side (service role) operation. No upload UI (Module 06).

## Auth Changes
- `src/lib/auth/roles.ts`: `parseRole(value)` now validates a `profiles.role` value; new `fetchUserRole(supabase, userId)` reads the user's own row (RLS).
- `src/lib/auth/session.ts`: `getCurrentUser()` reads the role from `profiles` (fallback `student`); `requireUser/requireRole` unchanged.
- `src/lib/auth/routes.ts`: added `requiresRoleCheck()`.
- `src/lib/supabase/proxy.ts`: for `/admin` and `/mentor/*` (except `/mentor/apply`) looks up the role in `profiles`; **fails closed** (lookup error / missing profile → redirect to `/dashboard`). No role is read from JWT/app_metadata/user_metadata. `getClaims()` and `getUser()` usage, two-layer protection, `safeRedirectPath` and generic error messages are unchanged.
- Signup is unchanged (no role/metadata sent); the DB trigger assigns `student`.

## Role Architecture
`profiles.role ∈ {student, mentor, admin}`, default `student`. Only `service_role` (server) can change it through `set_user_role(target_user, new_role, acting_admin?)`, which validates the role, optionally verifies the acting user is an admin, updates the row and writes `admin_actions`. Protections stack: no client UPDATE grant on `role`/`user_id`/`id`, a `BEFORE UPDATE` trigger that rejects client changes even if a grant is added by mistake, no client INSERT/DELETE on profiles, and a signup trigger that hard-codes `student`. Admin is never self-assignable and not assignable by other admins from the browser. Mentor promotion belongs to the future server-side verification flow (Module 17). First admin: run `select public.set_user_role((select id from auth.users where email='you@example.com'), 'admin');` in the SQL editor. Users who were admin/mentor via `app_metadata.role` are preserved by the migration backfill (verify yours after applying).

## Tests Performed
| Check | Result | Target |
|---|---|---|
| `npm run typecheck` | PASS | static |
| `npm run lint` | PASS | static |
| `npm run build` | PASS (also twice inside `test:auth`) | local; no secrets in `.next/static` |
| `npm run test:auth` | PASS 112/112 (97 main + 5 confirm + 4 refresh + 6 no-env; 10 new role checks) | **LOCAL MOCK** (not live) |
| `npm run test:db` | PASS 167/167 | **LOCAL Postgres 16 + Supabase shim** (not live) |
| Mutation check on `test:db` | 25 failures when policies/grants/trigger were deliberately broken, 0 when restored | local |
| Live Supabase (migrations applied + tests) | **NOT RUN** | sandbox cannot reach Supabase |

`test:auth` gotcha: run it WITHOUT `.env.local` present (its "no Supabase env" phase would pick it up).

## RLS Test Results (local Postgres + shim; not live Supabase)
```text
User A -> own profile                 PASS (allow)
User A -> User B profile              DENY (0 rows)
User A -> own document                PASS (allow)
User A -> User B document             DENY (0 rows)
User A -> User B file (storage)       DENY (0 rows)
Student -> change own role            DENY (permission denied; trigger also blocks if granted)
Student -> become admin               DENY (role/user_id change, insert profile, set_user_role all denied)
Student -> become mentor              DENY (role change denied; self-verify mentors.verification_status denied)
Mentor  -> modify admin-only data     DENY (scholarships, admin_actions, other users, own role/verification)
Admin   -> intended access            PASS (read all profiles/applications/education/mentors, read drafts,
                                              full CRUD on catalog data, audit read/append)
Admin   -> role change from client    DENY (service-role-only by design)
Admin   -> student documents/files    DENY (restricted by design)
Signup with user_metadata role=admin  profile is 'student'
Backfill                              app_metadata admin/mentor preserved; user_metadata & junk -> student
```
Also covered: anon access, cross-user education/experience/application/task writes and re-parenting, application against draft scholarship, document path/MIME/size CHECKs, `processing_status` not client-writable, uploads outside own folder/bucket, audit-log forging/tampering, `set_user_role` validation (bad role/user/acting user), final state unchanged after all escalation attempts, RLS enabled on every public table, anon has no privileges on private tables.

## Files Created
`supabase/migrations/20261001000{100,200,300,400}_*.sql`; `tests/db/{shim.sql,seed-pre.sql,rls.test.sql,run-rls-tests.sh}`.

## Files Modified
`src/lib/auth/{roles,session,routes}.ts`, `src/lib/supabase/proxy.ts`, `tests/auth-mock/{mock-supabase-auth.mjs,e2e.mjs}`, `package.json` (`test:db` script; no new dependencies), `README.md`, `docs/DECISIONS.md` (ADR-015 superseded; ADR-018–022), `docs/DATABASE.md` (section 12), `docs/PROGRESS.md`, `docs/HANDOFF.md`.

## Files Deleted
None.

## Environment Variable Changes
None. `SUPABASE_SERVICE_ROLE_KEY` is still server-only and is only needed by future server code that calls `set_user_role`.

## API / Edge Function / AI Changes
None (new DB function `set_user_role` is RPC-callable only by `service_role`).

## Known Issues
- **Not verified on real Supabase** (see Status). Risks specific to the hosted platform: creating policies on `storage.objects` from a migration, Storage API enforcement of the bucket size/MIME limits (only mirrored by CHECKs locally), the `auth.users` trigger firing on real signup, PostgREST error behavior for the role lookup.
- **Live verification checklist** (do before Module 04 relies on the DB): (1) apply the 4 migrations in order; (2) confirm all 14 tables show RLS enabled; (3) sign up a new user → a `profiles` row with `role='student'` exists; (4) promote one account with `set_user_role` and check `/admin` allows it and a student is redirected; (5) re-run Module 02 live smoke (login/logout/reset/protected routes); (6) run `tests/db/rls.test.sql` against a scratch/branch database via `psql`; (7) try uploading to the `documents` bucket as user A in A's folder (ok) and B's folder (denied), and a >10 MB / `.html` file (rejected by Storage).
- Future tables get Supabase's broad default grants again; each new migration must enable RLS and revoke/grant explicitly (ADR-020).
- Proxy now performs one `profiles` query on `/admin` and `/mentor/*` requests; `getCurrentUser()` performs one per call. Revisit with a Custom Access Token Hook only if it becomes a cost problem.
- Mentor claims can be edited by the owner after verification without resetting status — Module 17 should reset to `pending` (or lock) on claim changes.
- Deleting an Auth user cascades DB rows but not storage objects (orphan files) — Module 06 must handle cleanup.
- `applications.scholarship_id` is `ON DELETE RESTRICT`: archive scholarships instead of deleting ones with applications.
- `set_user_role` has no "last admin" protection.
- `profiles.date_of_birth` exists per DATABASE.md ("only if genuinely required"); do not collect it unless needed.
- `scholarship_sources.content_hash` is publicly readable (not sensitive). Public queries should select explicit columns.
- No generated Supabase TypeScript types yet (CLI unavailable); Module 05 may add them.
- All earlier Module 01/02 known issues still apply (every route dynamic; no app-level rate limiting).

## Incomplete Work
Live verification of Module 03 (above). No profile/scholarship/document UI (later modules). No admin/mentor pages; paths remain proxy-protected and pages added later MUST call `requireRole()` themselves.

## Important Architectural Decisions
ADR-018 (profiles.role source of truth; supersedes ADR-015), ADR-019 (roles change only via service role), ADR-020 (least-privilege grants + column grants), ADR-021 (Module 03 scope/typing choices), ADR-022 (private documents bucket). Earlier ADR-013–017 stand.

## Do Not Change
- Never grant clients UPDATE/INSERT on `profiles.role`, `profiles.user_id`, `mentors.verification_status/verified_at` or `documents.processing_status`; never add a client path that sets a role; keep the `profiles` guard trigger and the `student`-only signup trigger.
- Never read roles from the JWT, `app_metadata` or `user_metadata`; never accept a role at signup. Keep `profiles.role` lookups on the user's own session (not the service key) in the proxy/pages.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `set_user_role` to the browser; admin UIs must call it from server code only.
- Keep RLS enabled on every table, keep the `documents` bucket private with owner-folder policies, and keep admin out of `documents`/student files unless an explicit server-side operation is designed.
- Keep `getUser()` for authorization, `getClaims()` in the proxy, two-layer protection, `safeRedirectPath`, and the generic auth messages.
- Never edit an already-applied migration; add a new migration instead.
- Everything in the Module 02 "Do Not Change" list below still applies.

## Next Module
**Module 04 — Landing & Public Pages**
(Prerequisite: complete the live verification checklist under Known Issues, or accept that Module 04 builds on an unverified-live schema.)

## Next Module Objective
Landing page, navigation, footer, public country browsing, public scholarships and public mentor stories (docs/MODULES.md). Public reads must go through the existing anon-readable RLS (active scholarships, countries, verified mentors only); select explicit columns; mentor stories tables do not exist yet (Module 17), so keep that part to what the schema supports or stub it.

## Recommended First Steps for the Next AI
1. Read all docs, especially this file, ADR-018–022, `docs/SECURITY.md`, `docs/PAGES_AUTHORIZATION.md`, `docs/DATABASE.md` (section 12).
2. Ask the owner whether the migrations were applied to the real project; if so, record the live checklist results here and flip Module 03 to COMPLETE in PROGRESS.md; if not, apply them first.
3. Run `npm run test:auth` (without `.env.local`) and `npm run test:db` (needs local Postgres) to confirm the baseline.
4. Revisit the "every route is dynamic" issue (header reads session cookies) before building static/ISR public pages; consider an auth-nav isolated behind Suspense/client-side.
5. Use only the anon key for public pages; do not use the service role for public reads. Do not start Module 05.

---

# Archive — Module 02 handoff and earlier sessions

(Superseded where it conflicts with the Module 03 section above, e.g. role source = `app_metadata`, Module 03 as "next module".)

## Current Module
Module 02 — Authentication

## Status
**COMPLETE** — implemented, verified against a local mock (automated) and manually verified against a real Supabase project by the project owner. See "Live Supabase Verification (Session 4)".

## Next Module
**Module 03 — Database & Security**

## Next Module Objective
Core database schema, migrations, indexes, RLS, role authorization and storage foundations.

Module 03 has NOT been started. Sections below are kept as session history; where they conflict with this block, this block wins.

---

## Live Supabase Verification (Session 4 — manual verification, COMPLETE)

**Result: PASS (manual).** The project owner manually tested the real Supabase authentication flow against a real Supabase project and reported that everything works. **These live tests were performed manually by the project owner, not by Claude or the automated suite** (the Claude sandbox cannot reach `*.supabase.co`; see Session 3). Claude has not independently observed the live results; they are recorded here as reported.

| Flow | Live result | How |
|---|---|---|
| Signup | PASS | Manual, real Supabase |
| Login | PASS | Manual, real Supabase |
| Logout | PASS | Manual, real Supabase |
| Email confirmation | PASS | Manual, real Supabase |
| Forgot password | PASS | Manual, real Supabase |
| Password reset | PASS | Manual, real Supabase |
| Session persistence | PASS | Manual, real Supabase |
| Protected routes | PASS | Manual, real Supabase |
| Role-protected routes | PASS | Manual, real Supabase |
| Redirect behavior (incl. URL configuration) | PASS | Manual, real Supabase |

**Not individually reported (no live result recorded; covered only by the local mock):** session token refresh with real short-lived tokens, exact real error codes for invalid credentials / duplicate email / unconfirmed email, open-redirect (`next`) abuse cases, forged/tampered cookies, and logout invalidating a previously issued session. These passed against the mock only. Re-verify them live if convenient (e.g. during Module 03 when real roles are introduced).

**Dashboard configuration:** the exact Supabase dashboard values used were not recorded in this session. The required setup remains as in README → Authentication (Site URL = `NEXT_PUBLIC_APP_URL`; Redirect URLs include `<APP_URL>/auth/callback`; Confirm email choice; minimum password length 8).

**Local mock results (unchanged):** `npm run test:auth` — 102 checks, 0 failures (87 main + 5 confirm-mode + 4 refresh + 6 no-env), LOCAL MOCK, not live. typecheck, lint and build passed in Session 2 on the same code.

**Changes Made (Session 4):** documentation only. Modified: `docs/HANDOFF.md`, `docs/PROGRESS.md`. Created/deleted: none. No application code changed.

**Known Issues:** unchanged (see "Known Issues" below), plus the unverified-live items listed above. The service-role key was shared in chat in Session 3; it should have been rotated.

---

## Live Supabase Verification (Session 3 — credentials supplied, network blocked)

**Result: STILL BLOCKED. Module 02 stays PARTIALLY_COMPLETE. No code was changed.**

**Why:** a `.env.local` with real `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_APP_URL` was provided (values never printed). A single reachability check against the project's `/auth/v1/health` endpoint was rejected by the sandbox egress proxy with `x-deny-reason: host_not_allowed` (HTTP 403 from the proxy, not from Supabase). The sandbox only permits a fixed domain allow-list that does not include `*.supabase.co`, so no real Supabase request could be made. The credentials were not validated and no live test of any kind ran.

**Live tests performed:** none. **Passed live:** none. **Failed live:** none. **Not tested:** everything in the Session 2 list (signup, login, logout, email confirmation, forgot/reset password, session persistence/refresh, protected and role-protected routes, redirect URLs, safe `next`, logout invalidation, dashboard configuration).

**Checks this session:** typecheck, lint, build and `test:auth` (102/102, LOCAL MOCK) were last run in Session 2 on identical code; they were not re-run in Session 3. Note: `test:auth` builds and runs a "no Supabase env" phase, so it must be run **without** `.env.local` present (Next loads `.env.local` for builds and it would defeat that phase). This is a known harness limitation.

**To unblock:** add the project host (`<ref>.supabase.co`) to the sandbox allowed domains, or run the live checklist from a machine with internet access (`npm run dev` with `.env.local`, then the checklist in the Session 2 section) and record results here.

**Security note:** the service-role key was shared in chat. Module 02 does not need it. Rotate it (and consider rotating the anon key) in the Supabase dashboard. The working copy of `.env.local` in the sandbox was deleted; it was never copied to outputs.

**Next Module (historical, Session 3):** Continue Module 02 verification. Module 03 was NOT started.

---

## Live Supabase Verification (Session 2 — verification attempt)

**Result: BLOCKED. Module 02 stays PARTIALLY_COMPLETE. No code was changed.**

**Why:** there is no `.env.local` in the project and no `NEXT_PUBLIC_SUPABASE_*` / `SUPABASE_SERVICE_ROLE_KEY` in the environment. Credentials were not invented and no live Supabase call was made.

### What was tested
- Local mock only (re-run to confirm the baseline). Nothing against real Supabase.

### What passed (LOCAL MOCK, not live)
- `npm run test:auth`: 102 checks, 0 failures (87 main + 5 confirm-mode + 4 refresh + 6 no-env).

### What failed
- Nothing failed. (`tsc` initially reported missing `PageProps`/`LayoutProps` because Next 16 route types were not generated in a fresh checkout; `npx next typegen` or any `next build` generates them. Not a code defect.)

### What could not be tested (needs a real project)
Signup, login, logout, email confirmation, forgot/reset password with real emailed links, duplicate-email and unconfirmed-email behavior with real error codes, session persistence/refresh with real tokens, `getClaims()` with real signing keys, protected routes and admin/mentor denial for real users, safe `next` redirects through the real callback, redirect-URL allow-listing, logout invalidation, and all Supabase dashboard settings (Site URL, Redirect URLs, Confirm email, password policy, recovery redirect). **No dashboard configuration was used or verified.**

### Dashboard configuration to apply before the live run
Per README → Authentication: Site URL = `NEXT_PUBLIC_APP_URL`; Redirect URLs include `<APP_URL>/auth/callback`; decide Confirm email on/off (test both); minimum password length 8.

## Changes Made (this session)
- Files created: none. Files modified: `docs/PROGRESS.md`, `docs/HANDOFF.md` (this section). Files deleted: none. Generated and git-ignored: `node_modules/`, `.next/`.

## Tests (this session)
| Check | Result | Target |
|---|---|---|
| `npm run typecheck` | pass (after `next typegen`) | static |
| `npm run lint` | pass | static |
| `npm run build` | pass (run twice inside `test:auth`: with and without Supabase env) | local |
| `npm run test:auth` | 102/102 pass | LOCAL MOCK |
| Live Supabase tests | NOT RUN | none (no credentials) |

## Known Issues (this session)
- Module 02 remains unverified against real Supabase; all earlier Known Issues below still apply.
- A fresh checkout needs route types generated before `npm run typecheck` works standalone (consider adding `next typegen &&` to the script).

## Next Module (historical, Session 2 — superseded)
**Continue Module 02 verification.** Add real values to `.env.local`, apply the dashboard settings above, then run the live checklist. Only after all pass, flip Module 02 to COMPLETE and move to Module 03 — Database & Security. Module 03 was NOT started.

---

## Module Completed
Module 02 — Authentication (implemented). Module 01 — Foundation was completed earlier (see "Module 01 summary" at the bottom).

## Status (historical, Session 1 — superseded by Session 4)
**PARTIALLY_COMPLETE — code complete, NOT verified against live Supabase.**
No Supabase credentials were available (no `.env.local`), so real Supabase Auth was never called. All behavior was verified against a **local mock of the Supabase Auth REST API** that ships in `tests/auth-mock/`. The mock verifies *this app's* logic; it cannot prove Supabase's real error codes, email delivery, redirect allow-listing, or token formats match the mock's assumptions. See "Live Supabase Verification Status".

## What Was Built
- **Sign up** (`/signup`): email, password, confirm password; server-side validation (email format, 8–72 byte password, match). Works with email-confirmation ON (shows "check your email") or OFF (signs in and goes to `/dashboard`). Never sends a role/metadata to Supabase. Duplicate email → generic message; weak password → field message.
- **Login** (`/login`): email/password, field + form errors, one generic "Invalid email or password." for wrong password/unknown email, "confirm your email" message for unconfirmed accounts, rate-limit message. `?next=` honored only for safe same-site relative paths (open-redirect protected).
- **Logout**: server action form (POST, Next.js origin check), calls `signOut()`, redirects to `/login`. Shown in header when signed in.
- **Password reset**: `/forgot-password` (always the same success message, no account enumeration) → emailed link → `/auth/callback` (PKCE `code` or `token_hash`) → `/reset-password` (requires a session, server re-checks, updates password) → `/dashboard`.
- **Session handling**: Next.js 16 `src/proxy.ts` + `src/lib/supabase/proxy.ts` refresh the session cookies (`getClaims()`), propagate rotated cookies/cache headers on redirects, and fail closed if Supabase env is missing.
- **Protected routes** (proxy redirect to `/login?next=…`): `/dashboard`, `/profile`, `/documents`, `/matches`, `/applications`, `/ai/*`, `/mentor/*`, `/admin/*`. Only `/dashboard` exists as a (placeholder) page; the rest 404 once authenticated, but are never reachable unauthenticated.
- **Server-side guards**: `requireUser()` / `requireRole()` in `src/lib/auth/session.ts`; `(protected)` route-group layout as backstop; dashboard page re-checks itself.
- **Authenticated routing**: after login/signup → `/dashboard` (per PAGES_AUTHORIZATION.md); `/login` and `/signup` redirect signed-in users to `/dashboard`.
- **Authorization foundation (TEMPORARY)**: role from `app_metadata.role` only (ADR-015). `/admin/*` admin only; `/mentor/*` mentor/admin, except `/mentor/apply` (any signed-in user).
- **Header** shows Log in / Sign up or Dashboard / Log out.
- **Dev test harness**: `npm run test:auth`.

## Files Created
- `src/proxy.ts`, `src/lib/supabase/proxy.ts`
- `src/lib/auth/{actions,roles,routes,session,types,validation}.ts`
- `src/app/auth/callback/route.ts`
- `src/app/(auth)/{login,signup,forgot-password,reset-password}/page.tsx`
- `src/app/(protected)/layout.tsx`, `src/app/(protected)/dashboard/page.tsx`
- `src/components/auth/{auth-card,form-field,form-message,submit-button,logout-button,login-form,signup-form,forgot-password-form,reset-password-form}.tsx`
- `src/components/ui/{input,label}.tsx`
- `tests/auth-mock/{mock-supabase-auth.mjs,e2e.mjs,run-all.sh}`

## Files Modified
- `src/components/layout/site-header.tsx` (auth-aware nav)
- `src/lib/env.ts` (added `getAppUrl()`)
- `package.json` (`test:auth` script; **no new dependencies**), `eslint.config.mjs` (ignore `tests/**`)
- `README.md`, `docs/DECISIONS.md` (ADR-013–017), `docs/PROGRESS.md`, `docs/HANDOFF.md`

## Files Deleted
- `src/app/loading.tsx` (Module 01 placeholder; caused page redirects to stream as HTTP 200 — ADR-017)

## Database Changes
None. No tables, migrations, or triggers. (Module 03 owns the schema.)

## RLS Changes
None.

## API Changes
- Added `GET /auth/callback` (handles `code` and `token_hash`; open-redirect-safe `next`; failures → `/login?error=link_invalid`).
- Server Actions: `signUp`, `login`, `logout`, `requestPasswordReset`, `updatePassword` (`src/lib/auth/actions.ts`).
- `GET /api/health` unchanged. No Edge Functions.

## AI Changes
None.

## Environment Variable Changes
None added. `NEXT_PUBLIC_APP_URL` is now **functionally required in deployed environments**: it builds email redirect links and must match the Site URL / Redirect URL allow-list in Supabase. Defaults to `http://localhost:3000`.

## Tests / Checks Performed
- `npm run typecheck` ✅, `npm run lint` ✅, `npm run build` ✅ (with and without Supabase env).
- `npm run test:auth` ✅ — **102 checks, 0 failures**, against the local mock (ports 3200/54321). It drives the real forms and server actions over HTTP with a cookie jar:
  - Unauthenticated access redirects for all protected prefixes (incl. nested paths); `/mentors` stays public; `next` param preserved.
  - Signup validation (no Supabase call on invalid input; password never echoed); signup success + session; no role/metadata sent; duplicate and weak-password handling; email-confirmation-required mode.
  - Login success/failure (wrong password, unknown email, empty fields), no session on failure, open-redirect blocking (`https://`, `//`, `/\`, `javascript:`).
  - Logout (cookies cleared, Supabase `/logout` called, access blocked afterwards).
  - Forgot password (identical response for known/unknown email, correct `redirect_to`, PKCE verifier cookie), recovery link → reset → old password rejected/new works, same-password rejection.
  - Callback abuse (bad code, missing params, bad OTP type, evil `next`, no reflection of `error` param).
  - Tampered and forged session cookies → treated as signed out.
  - Roles: student blocked from `/admin` and `/mentor/*` (except `/mentor/apply`); `app_metadata` mentor/admin allowed appropriately; unknown role value → student.
  - Session refresh in the proxy with a short-lived token (refresh grant performed, cookies rotated, `Cache-Control` set).
  - No Supabase env: protected routes redirect, public pages render, forms show a "not configured" message instead of crashing.
- Ad-hoc (not in the suite): with the **proxy disabled**, `/dashboard` still redirects unauthenticated users and leaks no content (server-side guard works alone). Pure-helper unit checks (`safeRedirectPath`, route policy/prefix boundaries, `parseRole`, validators) passed via a throwaway script (not committed).
- Dummy secrets set at build time did not appear in `.next/static` or `public`. No client component imports `env.server.ts`, `supabase/admin.ts` or `auth/session.ts`. `.env.local` and the mock harness secrets are not committed (`.env.example` is the only tracked env file).

## Live Supabase Verification Status (historical, Session 1 — superseded by Session 4)
**NOT VERIFIED at that time.** No real Supabase project or credentials were available. Not tested live: connection, `auth.getUser()` against Supabase, real signup/login/logout, email delivery, real recovery links, redirect-URL allow-listing, real error codes (`invalid_credentials`, `user_already_exists`, `weak_password`, `email_not_confirmed`, `same_password`, rate-limit codes), cookie chunking with real (larger) tokens, `getClaims()` with real asymmetric signing keys, and browser/UI rendering (verified over HTTP/HTML only; no JS-enabled browser run).

## Known Issues
- **Every route is now dynamic** when Supabase env is set (the header reads session cookies in the root layout). This conflicts with PRD "fast public pages" in spirit. Module 04 should revisit (e.g. client-side or Suspense-isolated auth nav) before relying on static public pages.
- **Role changes lag**: the proxy reads the role from the JWT, so a granted/revoked role applies after token refresh/re-login (≤ the JWT lifetime). `requireUser()` reads fresh data via `getUser()`.
- **No app-level rate limiting/CAPTCHA** (relies on Supabase's built-in limits; Module 18 covers hardening). Supabase's own password-policy setting must be aligned manually (min 8).
- The mock encodes my assumptions about Supabase's API. Treat a live run as the real test.
- `signUp` with confirmation ON and an already-registered email returns Supabase's obfuscated success (a "check your email" message); that is expected Supabase behavior.
- The Supabase server client still swallows cookie writes in Server Components by design; refresh is done in the proxy.

## Incomplete Work
- ~~Live Supabase verification~~ done manually in Session 4.
- Dashboard is a placeholder; no profile/onboarding (out of scope).
- No `mentor`/`admin` pages exist yet; their paths are protected and role-gated by the proxy only. **Pages added later MUST call `requireUser()`/`requireRole()` themselves.**
- No email-change, account-deletion, MFA, or OAuth flows (not requested).

## Important Architectural Decisions
ADR-013 (Server Actions + cookie sessions), ADR-014 (two-layer protection), ADR-015 (TEMPORARY `app_metadata` roles), ADR-016 (`/mentors` public, `/mentor/*` protected — **resolves a conflict between the module prompt and PAGES_AUTHORIZATION.md; confirm with the product owner**), ADR-017 (root `loading.tsx` removed). Existing Supabase client files were preserved (only added `lib/supabase/proxy.ts`).

## Do Not Change
- Never read roles from `user_metadata` or the client; never accept a role on signup.
- Keep `safeRedirectPath` on every redirect that uses user input; keep the generic login/forgot-password messages (no account enumeration).
- Keep `getUser()` (not `getSession()`/`getClaims()`) for authorization decisions in pages/actions; keep `getClaims()` in the proxy.
- Do not rely on the proxy alone for protection. Do not add a root `loading.tsx`.
- Never import `env.server.ts`, `supabase/admin.ts`, `auth/session.ts` from client components. Do not put secrets in `NEXT_PUBLIC_*`.
- Everything listed under Module 01's "Do Not Change" still applies.

## Next Module (Session 1 text; still valid)
**Module 03 — Database & Security**

## Next Module Objective (Session 1 text)
Core schema, migrations, indexes, RLS, role authorization and storage foundations per `docs/DATABASE.md` and `docs/SECURITY.md`.

## Next Module Dependencies
- Live Supabase project with `.env.local` filled in (and the dashboard URL config from README → Authentication).
- Module 02 auth in place. **Must replace the temporary role source (ADR-015):** create `profiles` (with `role`, not user-writable), RLS so users can never grant themselves mentor/admin, and a way to grant admin outside public signup. Then update `parseRole`/`getCurrentUser` (and proxy role reads) to use it without weakening current guarantees. Decide how `profiles` rows are created at signup (e.g. a DB trigger on `auth.users`).

## Recommended First Steps for the Next AI
1. Read all docs, especially this file, ADR-013–017, `SECURITY.md`, `PAGES_AUTHORIZATION.md`, `DATABASE.md`.
2. **Do the live verification first**: fill `.env.local`, configure Supabase URL settings, then manually sign up, log in, log out, reset a password, and hit protected routes; record results here and in PROGRESS.md (flip Module 02 to COMPLETE only after this).
3. Run `npm run test:auth` to confirm the baseline still passes before changing anything.
4. Build the schema as migrations in `supabase/migrations/` with RLS enabled on every user-owned table; test RLS with two users (User A cannot read User B).
5. Replace the `app_metadata` role source per ADR-015, rerun `npm run test:auth`, and extend it for the new role source.
6. Do not start Module 04.

## Module 01 summary (unchanged)
Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui foundation, Supabase client files (`client.ts`, `server.ts`, `admin.ts`), env handling (`env.ts`/`env.server.ts`, `.env.example`), error pages, `/api/health`, README. Verified by typecheck, lint, build and smoke tests; no live Supabase test.

## Repair Session 1 handoff — data pipeline
- Dataset is STILL EMPTY. To populate: (1) insert real `countries`/`universities` rows via SQL/dashboard; (2) admin pastes verified JSON at `/admin/scholarships/import` (optionally with `sources`); (3) verify each source + scholarship in the editor; (4) Publish — now blocked until verified (see docs/DATA_IMPORT.md).
- Owner must run `npm ci && npm run typecheck && npm run lint && npm run test:admin-scholarships && npm run test:db` — none of the first four besides the last-named suite were run here.
- Suggested follow-up (not done): DB trigger enforcing the publish gate; admin UI for countries/universities.
- Session 2 and Module 14 not started.
