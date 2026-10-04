# ScholarPath PK — Progress

| Module | Status | Notes |
|---|---|---|
| 01 Foundation | COMPLETE | Verified: typecheck, lint, production build, runtime smoke tests. See HANDOFF.md. |
| 02 Authentication | COMPLETE | Implemented. 112 checks pass (102 originally + 10 for the profiles-based role source) against a LOCAL MOCK of Supabase Auth (`npm run test:auth`; typecheck/lint/build pass). Live Supabase auth (signup, login, logout, email confirmation, forgot/reset password, session persistence, protected and role-protected routes, redirects) was MANUALLY verified by the project owner against a real project. Not individually live-verified: token refresh, real error codes, open-redirect abuse cases, logout invalidation (mock only). See HANDOFF.md. |
| 03 Database + Security | COMPLETE | 14 tables, indexes, RLS + column grants, `profiles.role` role architecture, signup profile trigger, private `documents` bucket. Verified locally (Postgres 16 + shim: 167/167; `test:auth` 112/112 on mock). **The project owner reported (Module 04 prompt) that Module 03 has been verified against the real hosted Supabase project.** That live run was performed by the owner, not observed by Claude; the live checklist results were not recorded in the repo. |
| 04 Landing + Public Pages | COMPLETE | Owner-verified (reported in the Module 05 prompt). In the Module 05 session Claude also observed `lint`, `typecheck`, `build`, `test:auth` and `test:db` pass, and an HTTP smoke test of the public routes returned 200 against the local mock (no data, so empty states only). Details below and in HANDOFF.md. |
| 05 Student Profile | PARTIALLY_COMPLETE | Implemented and verified locally: `lint`, `typecheck`, `build`, `test:auth` (133 checks), `test:db` (188/188, 21 new), `test:profile` (36 unit), `test:profile-ui` (32 real-browser checks). **NOT_VERIFIED against the real Supabase project** (no credentials/network in the session). See "Module 05 — details". |
| 06 Document Vault | PARTIALLY_COMPLETE | Implemented. Locally verified ONLY by `test:documents` (43 unit + 22 static-security checks, run in the authoring session). **`lint`, `typecheck`, `build`, `test:auth`, `test:db`, `test:profile`, `test:profile-ui` were NOT RUN** (no `node_modules`, npm registry blocked). **NOT_VERIFIED against real Supabase** (`tests/documents/live-verify.mjs` written, not run). No Module 06 mock-e2e or browser tests exist yet. See "Module 06 — details" and HANDOFF.md. |
| 07 Scholarship Data | PARTIALLY_COMPLETE | Admin scholarship CRUD, publish/archive workflow, source management and JSON draft import implemented. Observed passing in the authoring session: `lint`, `typecheck`, `build`, `test:auth` (133), `test:db` (215/215, 27 new on local Postgres 16), `test:profile` (36), `test:documents` (22 static), `test:admin-scholarships` (37 unit + 25 static). **NOT RUN:** browser verification of the admin UI, `test:profile-ui`, any live Supabase check. **No curated dataset exists** (none supplied; none fabricated). See "Module 07 — details" and HANDOFF.md. |
| 08 Search + Filters | PARTIALLY_COMPLETE (owner reported it verified in the Module 09 prompt; results not recorded in the repo) | Implemented on the existing `/scholarships` page. Observed passing locally: `lint`, `typecheck`, `build`, `test:auth` (133), `test:db` (242/242, 27 new Module 08 checks on local Postgres 16), `test:search` (20 unit + 11 static), `test:profile` (36), `test:documents` (43 + 22), `test:admin-scholarships` (37 + 25), HTTP smoke of odd query params (200, unconfigured Supabase). **NOT RUN:** browser verification, any run against real Supabase/PostgREST with data, `test:profile-ui`. See "Module 08 — details". |
| 09 Eligibility + Matching | PARTIALLY_COMPLETE | Implemented: authenticated `/matches` + pure deterministic engine (`src/lib/matching`), ADR-031. No migration. Observed passing locally: `lint`, `typecheck`, `build`, `test:auth` (159+5+4+6; 26 new L4 `/matches` checks on the mock), `test:db` (242/242, unchanged), `test:matching` (54 unit + 22 static; mutation-checked), `test:matching-ui` (41 real-browser checks, desktop + mobile), `test:profile-ui` (32), `test:profile` 36, `test:documents` 43+22, `test:admin-scholarships` 37+25, `test:search` 20+11. **NOT RUN:** anything against real Supabase/PostgREST with real data; manual verification by the owner. See "Module 09 — details". |
| 09b Matching correctness (Repair Session 3) | PARTIALLY_COMPLETE | Student-to-scholarship matching repaired and re-tested (ADR-036, amends ADR-031). See "Repair Session 3 — details" below. Live Supabase verification **BLOCKED** (no credentials/network). |
| 10 Scholarship Details + Sources | PARTIALLY_COMPLETE | Implemented: extended `/scholarships/[id]` (verification/staleness notice, key-dates phase, funding breakdown, requirements with per-item source attribution, host-labelled safe links, recorded sources, **Pakistan-side section** via the `pakistan_side` requirement-row convention), pure logic `src/lib/public/detail.ts`, ADR-032. No migration. Observed passing in this session (sandbox had no npm access): `test:details` (19 unit + 14 static, mutation-checked), `test:matching` (55 unit incl. 1 new + 22 static), `test:search` 20+11, `test:profile` 36, `test:documents` 43+22, `test:admin-scholarships` 37+25. A stub-based `tsc` pass over the changed files was clean (NOT the real typecheck). **NOT RUN:** `lint`, `typecheck`, `build`, `test:auth`, `test:db`, any browser test, anything against real Supabase. One approved Module 09 behaviour changed (matching skips `pakistan_side` rows). See "Module 10 — details". |
| 11 RAG Knowledge Base | PARTIALLY_COMPLETE | Implemented backend-only (no UI, per roadmap): migration `20261002000100` (pgvector, `knowledge_documents`, `knowledge_chunks`, RLS + admin-read-only, service-role-only `match_knowledge_chunks()`), pure ingestion/retrieval library `src/lib/knowledge/` (SSRF-safe fetch, HTML/text extraction, deterministic chunking, `EmbeddingProvider` + Gemini `gemini-embedding-001`@768, eligibility rule, pipeline, retrieval), admin-only `POST /api/admin/knowledge/ingest`, ADR-033. Observed passing in this session (sandbox: no npm registry, no Postgres): `test:knowledge` (59 unit with MOCKED I/O + 18 static; 21 mutation checks caught), regression `test:details` 19+14, `test:matching` 55+22, `test:search` 20+11, `test:profile` 36, `test:documents` 43+22, `test:admin-scholarships` 37+25; stub-based `tsc` of the server-only files clean (NOT the project typecheck). **NOT RUN:** `lint`, `typecheck`, `build`, `test:auth`, **`test:db` (53 new SQL checks written, never executed; migration never applied to any Postgres)**, any browser test, any real Supabase, **any real Gemini call**. PDF sources unsupported. See "Module 11 — details". |
| 12 RAG Assistant | PARTIALLY_COMPLETE | Grounded, cited, scholarship-scoped Q&A (ADR-034): `src/lib/assistant/`, `POST /api/assistant/ask`, assistant panel on `/scholarships/[id]`. Observed locally: `test:assistant` 26 unit (MOCKED retrieval/Gemini) + 16 static; 4 mutation checks caught; Module 11 static 18, details 14, matching 22, search 11, admin-scholarships 25, documents 22 still pass. **NOT RUN:** `npm ci`, lint, typecheck, build, any real Gemini call, any real Supabase, browser test. See "Module 12 — details". |
| 13 Agentic Scholarship Assistant | PARTIALLY_COMPLETE | Bounded policy-gated agent (ADR-035) + Repair Sessions 4–8. Wired prepare-flow: scholarship → profile → documents → eligibility → RAG → gaps → tasks → roadmap → next action. Local unit/static verification only (see Repair Session 8). **NOT COMPLETE:** real Supabase, real Gemini, browser E2E, Student A/B isolation live — all **BLOCKED**. Do not start Module 14 until live checklist passes. |
| 14 Application Workspace | PARTIALLY_COMPLETE | List + detail workspace: status, notes, tasks, roadmap display, start-from-scholarship. Unit 6 + static 8. Live Supabase/browser **BLOCKED**. See HANDOFF Module 14. |
| 15 Application Copilot | PARTIALLY_COMPLETE | Draft types, migration+RLS, API generate, save/approve/delete, panel on application detail. Unit 9 + static 21. Live Gemini/DB **BLOCKED**. See HANDOFF Module 15. |
| 16 Application Review | PARTIALLY_COMPLETE | Health panel on application detail: eligibility, docs, writing, tasks, deadline, consistency heuristics. Pure engine + service.server. Unit 16 + static 44. Live Supabase/browser **BLOCKED**. See HANDOFF Module 16. |
| 17 Mentor Community | PARTIALLY_COMPLETE | Apply, admin verify, stories/timelines/Q&A, public list+detail. Migration+RLS. Unit 10 + static 31. Live **BLOCKED**. See HANDOFF Module 17. |
| 18 Admin + Production Hardening | PARTIALLY_COMPLETE | Dashboard stats, users, reports, sources, RAG status, audit, settings; reports migration+RLS; security headers; health flags. Unit 6 + static 32. Live **BLOCKED**. See HANDOFF Module 18. |

## Status values

- NOT_STARTED
- IN_PROGRESS
- PARTIALLY_COMPLETE
- COMPLETE
- BLOCKED

## Module 04 — details

**Status: PARTIALLY_COMPLETE (implemented, not verified).**

Implemented: landing page; responsive public header (desktop nav + mobile menu) and footer; `/scholarships` (deterministic SQL filters: search, country, degree, field, funding, hide-closed, sort, pagination); `/scholarships/[id]`; `/countries`; `/countries/[country]`; `/mentors` (intro + aggregate verified count only); per-route `loading.tsx` and `not-found.tsx`; SEO metadata (static + dynamic); empty / unavailable states; no migrations.

Not run (blocked by sandbox, see HANDOFF.md): lint, typecheck, build, `test:auth`, `test:db`, manual smoke tests (guest and signed-in), security smoke tests.

Decisions: ADR-023 – ADR-026 in DECISIONS.md.

Known limitations: root layout still reads the session (routes stay dynamic; deliberately not changed, ADR-025); no application-process field exists in the schema, so it is not shown; application fee has no currency column; `/mentors` shows no individual mentors (no display-name field / consent model until Module 17).

## Module 05 — details

**Status: PARTIALLY_COMPLETE — everything that can run locally passes; live Supabase verification is NOT_VERIFIED.**

Implemented: authenticated `/profile` (personal info, education CRUD, experience CRUD, completion indicator), server-side validation, Server Actions on the cookie-bound client (RLS enforces ownership), loading state, empty/error/success states, delete confirmation, header + dashboard links to `/profile`. No schema change and no new migration.

Verified locally (Claude observed these results):
- `npm run lint`, `npm run typecheck` (after `npx next typegen`), `npm run build`: pass.
- `npm run test:auth`: 118 + 5 + 4 + 6 = 133 checks pass (15 new in section L3).
- `npm run test:db`: 188/188 pass on local Postgres 16 + shim (21 new Module 05 checks).
- `npm run test:profile`: 36/36 validator + completion unit tests.
- `npm run test:profile-ui`: 32/32 in headless Chromium against the local mock (add/edit/delete, validation, forged record ids from a second user, no secrets in the page).

NOT verified: anything against the real hosted Supabase project (two-user CRUD + cross-user RLS on live data). The mock REST layer emulates ownership but is not Postgres; real RLS is covered only by `test:db` on local Postgres.

Known limitations: see HANDOFF.md ("Known Issues / Limitations").

Decisions: ADR-027 in DECISIONS.md.

## Module 06 — details

**Status: PARTIALLY_COMPLETE — implemented; only unit + static checks have been run; everything else is NOT_RUN / NOT_VERIFIED.**

Implemented: `/documents` (privacy note, upload form with visible limits, optional document type, server-rendered list with file name / type / format / size / upload date, empty state, unavailable state, `loading.tsx`); `uploadDocument` and `deleteDocument` Server Actions (cookie-bound client, RLS authoritative); authenticated `GET /documents/[id]/file` producing 60-second signed URLs; two-step delete confirmation; header + dashboard links. No schema change, no migration. Decisions: ADR-028.

Observed passing in the authoring session: `npm run test:documents` pieces — `tests/documents/run-unit.sh` (43/43) and `node tests/documents/security-static.test.cjs` (22/22; the checks were also shown to FAIL when a raw error return and a `getPublicUrl` call were injected). Genuine PDF/PNG/JPEG/DOCX files were accepted by the signature detector and a GIF was rejected.

NOT RUN: `lint`, `typecheck`, `build`, `test:auth`, `test:db`, `test:profile`, `test:profile-ui`, `test:documents-live`; any Module 06 mock-e2e/browser test (not written); all live Supabase verification.


## Module 07 — details

**Status: PARTIALLY_COMPLETE.** Prerequisite note: Module 06 is itself PARTIALLY_COMPLETE (never live-verified); Module 07 does not depend on its documents code.

Implemented: `/admin`, `/admin/scholarships` (server-side pagination 20/page, search on name/provider, status filter), `/admin/scholarships/new`, `/admin/scholarships/[id]` (edit, publish / unpublish / archive / restore with confirmation, "mark verified", sources CRUD, guarded delete), `/admin/scholarships/import`, dashboard link for admins. No migration, no public-page change. Decisions: ADR-029.

Remaining: (1) owner to verify the admin UI in a browser against real Supabase with a real admin account; (2) the curated dataset itself (needs verified records + countries/universities rows); (3) optional browser/mock-e2e tests for the admin UI (none written); (4) admin UI for requirements/countries/universities if wanted.

## Module 08 — details

**Status: PARTIALLY_COMPLETE.** No migration, no new route; Module 07 code untouched.

Already existed from Module 04 (reused): `/scholarships` page, GET form, filters for country / degree / field / funding / hide-closed, sort, 12-per-page pagination, `ScholarshipCard`, `EmptyState` / `UnavailableState`, `loading.tsx`, URL-driven state, `escapeSearch` idea.

Added: keyword search across name, provider, field, degree_level, eligibility_summary **and university name and country name**, split into words that must ALL match (max 5 words); University filter (only universities that have a public scholarship); Deadline-window filter (within 30 / 90 / 180 days, never past dates); `search` accepted as an alias of `q`; removable active-filter chips; "Reset filters"; filters auto-submit on change when JavaScript is on (Apply button remains as the no-JS path); result range in the count; a failed query now shows the in-page unavailable state instead of the error boundary; stable ordering (id tie-break) so pagination does not shuffle.

Remaining: (1) browser + mobile verification; (2) live Supabase verification with real data (PostgREST `or()` clauses, embedded filters); (3) `test:profile-ui`-style browser test for this page (none written).

## Module 09 — details

**Status: PARTIALLY_COMPLETE.** Implemented and locally tested; NOT verified against the real Supabase project; browser checks were run against the local mock only.

Implemented: `/matches` (inside `(protected)`): "How matching works" disclosure, profile-completion guidance with links to `/profile#education`, per-scholarship eligibility status + "why it matched / does not match / needs your confirmation / not checked" explanations, deadline handling, reuse of the public `ScholarshipCard` (links to `/scholarships/[id]`), options (`?show=all`, `?closed=1`, `?page=n`), empty / add-education / unavailable / loading states, header + dashboard links. Pure engine: `src/lib/matching/{types,normalize,eligibility,explain,profile-gaps,rank,params,index}.ts`; data access: `queries.ts`. Rules and methodology: ADR-031.

Not implemented (not supported by the data, documented): nationality / age / language-score eligibility, country or university preferences, interpretation of `structured_value`, a relevance score (deliberately none), AI of any kind, saving matches, applications.

Remaining: (1) owner verification on real Supabase with real data (see HANDOFF); (2) a curated scholarship dataset with consistent `degree_level`/`field` wording (the engine depends on it); (3) later modules may add structured eligibility data.

## Module 10 — details

**Status: PARTIALLY_COMPLETE — implemented; verification limited to what could run without `node_modules`.**

Roadmap scope (MODULES.md): "Complete detail page, funding breakdown, requirements, dates, official URLs, last verified date and Pakistan-side section." The Module 04 page already had funding, requirements, dates, URLs and last-verified; Module 10 added what was missing: freshness/verification state, source attribution and honest source labelling, host-labelled safe links, an application-window status, in-page navigation, back links to `/scholarships` and `/matches`, and the Pakistan-side section.

**Observed in this session (local only):** see the table row above. Mutation checks: future-date-as-verified, unsafe protocols allowed, stale-threshold off by one, and matching counting Pakistan-side rows each made the intended test fail; files restored byte-for-byte afterwards.

**NOT verified:** real `lint`/`typecheck`/`build` (npm registry returned 403, so no `node_modules`); `test:auth`/`test:db` (no Postgres; mock e2e needs a build); real-browser desktop/mobile checks; real Supabase/PostgREST (the new `source_id` select and the page's data path have never run against a real database). No Module 10 mock-e2e or browser tests were added because none could be executed.

**Known limitations:** Pakistan-side data has no admin editor (SQL/service role only) and uses a convention rather than a table; no Pakistan-side content exists anywhere in the repo by design; `STALE_AFTER_DAYS = 180` is a display heuristic; source priority ordering (lower = more trusted) is still an unconfirmed assumption from ADR-026; fee currency still not stored; no draft preview for admins on this page.


## Module 11 — details

**Status: PARTIALLY_COMPLETE — implemented; verified only by unit tests with mocked I/O and static checks. The SQL has never been executed and no real embedding call has been made.**

Scope: backend-only (the roadmap names no page). Implemented: source eligibility (ADR-033 §1), SSRF-safe fetch, HTML/plain-text extraction + normalization, deterministic chunking with section metadata, `EmbeddingProvider` with a Gemini implementation (`gemini-embedding-001`, 768 dims), ingestion pipeline with processing status/safe error codes, retrieval returning chunks with source references, migration + RLS + `match_knowledge_chunks()`, admin-only ingestion route, tests, ADR-033, DATABASE.md §15.

Not in scope / deferred: PDF ingestion (unsupported → `failed: unsupported_content_type`), the assistant (Module 12), admin RAG UI/monitoring/audit (Module 18), IP-pinned fetching (DNS-rebinding hardening), similarity threshold + RAG benchmark (needs real data; Module 12).

Next module: **Module 12 — RAG Assistant**. Do not start it until the Module 11 checklist in HANDOFF.md has passed.


## Module 12 — details

**Status: PARTIALLY_COMPLETE — implemented; verified only by mocked unit tests and static checks.** No real Gemini call, no real Supabase, and no `npm ci`/lint/typecheck/build were possible (sandbox: registry 403, no Postgres, no keys).

Implemented (ADR-034): `src/lib/assistant/{config,validate,prompt,generation,answer,index}.ts`, `service.server.ts`, `POST /api/assistant/ask`, `AssistantPanel` on `/scholarships/[id]` (sign-in prompt for guests), `test:assistant`.
Not implemented (by design): anything from Module 13, history, rate limiting, similarity threshold, PDF sources.
Module 11 status caveat: the task prompt stated Module 11 was complete and verified; the repo's HANDOFF still lists its owner checks as not recorded. That statement is recorded here as the owner's, not as evidence seen in this session.


## Module 13 — details

**Status: PARTIALLY_COMPLETE — implemented; verified by local static/unit/mutation tests and typecheck/lint/build only. No real Gemini, Supabase, SQL execution or browser run.**

Implemented (ADR-035): `src/lib/agent/{config,types,validators,tools,policy,state,plan,eligibility,approval,model,report,validate,orchestrator,index}.ts`, server-only `executors.server.ts` + `service.server.ts`, `POST /api/agent/run` (`start` / `decide`), `src/components/scholarship/agent-panel.tsx` (mounted in `assistant-panel.tsx`), migration `20261003000100_application_roadmaps.sql`, tests in `tests/agent/` (unit, static, mutation, migration hash pins), `package.json` scripts `test:agent`, `test:agent-mutation`.
Not implemented (by design): application workspace/UI for tasks (M14), copilot drafting (M15), review (M16), mentors (M17), admin/hardening (M18), any external action, scheduled monitoring, document content analysis, run history, rate limiting.

## Repair Session 1 — Scholarship data pipeline (Module 07 data-readiness)
Implemented: publish-readiness gate (`src/lib/admin-scholarships/readiness.ts`, enforced in `changeScholarshipStatus`); JSON import now accepts optional per-record `sources` (unverified, rolled back on failure); duplicate check now fetched per country and case-insensitive; new tests `tests/admin-scholarships/pipeline.test.cjs` (22) wired into `test:admin-scholarships`.
Verified (actually run): admin-scholarships 37 existing unit + 22 new pipeline + 25 static, all pass (using local tsc 6.0.3 with `--ignoreConfig`; the committed script is unchanged for TS 5).
**BLOCKED:** real-data population — no verified dataset, no Supabase credentials, no countries/universities rows were available; nothing was invented. Also NOT RUN: lint, typecheck, build (no node_modules), `test:db`, any live Supabase/browser check. No DB trigger added (untestable here).
Not changed: search, matching, profile, documents, RAG, assistant, agent, UI components.

## Repair Session 3 — details (matching, 2026-10-03)

**Scope:** only student-to-scholarship matching. AI agent, RAG, document AI and Module 14 untouched (agent files byte-identical to the Session 2 zip).

**Traced and found correct (no change needed):** session identity (`requireUser()` -> `user.id`, no URL identity) -> `loadOwnProfile` (`profiles.user_id`, then `education.profile_id`) -> anon-client scholarship query with embedded requirements -> `toMatchScholarship` -> engine -> `buildMatches` -> `MatchCard`. Every selected column exists in the real migrations; snake_case -> camelCase mapping is exact; RLS policies exist for own-profile/own-education/active-scholarship reads; failures render "temporarily unavailable", not "no matches".

**Defects found and fixed (all in the engine's overall result, reproduced with realistic students):**
1. A field-restricted scholarship was **"Likely eligible" when the student had no field of study recorded** (missing information became eligible).
2. A scholarship in a **clearly different field was "Likely eligible"** (visible with "show all") while the same card listed "Does not match your profile".
3. The result could not express the four required outcomes; "Possibly eligible" blended *missing profile data* with *cannot be decided at all*.

**Fix:** `MatchResult.decision` = `eligible | not_eligible | needs_information | unknown` (derived from the same checks as `status`; `status` is kept unchanged in shape so the agent mapping still works). A restricted field that is unknown or has no word overlap now prevents `eligible` but never produces `not_eligible` (free-text words cannot prove a mismatch). `/matches` badges show the decision; page explainer lists what is NOT checked.

**Actually evaluated:** degree level, minimum GPA (+scale), field of study (word overlap, never decisive for not-eligible), deadline/availability, scholarship visibility (`active`). Written requirement rows are listed but never verified (always unresolved => never `eligible`). **Not evaluated (schema has no data):** nationality, age, IELTS/English scores (shown as info only), research, preferences, `structured_value`.

**Verification observed this session (sandbox: no `node_modules`, no npm registry, no Postgres, no Supabase):**
| Check | Result |
|---|---|
| matching unit (`matching.test.cjs`) | 55 pass (1 test rewritten: it encoded defect 2) |
| NEW `scenarios.test.cjs` (Students A-D, unknown vs needs-information, exhaustive "missing never eligible" grid, evaluated-vs-not boundary) | 22 pass |
| NEW `flow.test.cjs` via `run-flow.sh` (real `queries.ts` + `profile/queries.ts` against an in-memory Supabase stand-in; columns validated against the real DDL; RLS hand-copied from the migration) | 19 pass |
| matching static | 26 pass (4 new) |
| profile unit 36; search 22 unit + 11 static; details 19 + 14; admin-scholarships static 25; knowledge static 18; agent static 23 | pass |
| agent unit | 65 pass, compiled with `--noCheck` (`@types/node` missing, so the script's own compile fails here) |
| mutation checks | field-gating removed, missing-GPA-as-met, decision never needs_information, wrong column name, wrong field mapping: each caught (the last one only after a test was added) |

**BLOCKED / NOT RUN:** live Supabase (student isolation, real RLS, PostgREST parsing); `test:db`; `npm run typecheck`, `lint`, `build` (changed `.tsx` files are NOT type-checked; engine files compile under `--strict`); `test:matching-ui` and `test:auth` (need running app + Playwright; their label assertions were updated to a `data-decision` attribute but **never executed**).


## Repair Session 4 — details (AI scholarship discovery, 2026-10-03)
Scope: agent discovery only. Student profile code, matching, RAG, assistant, migrations, Module 14: untouched.
Changed: `src/lib/agent/{types,tools,plan,state,model,report,orchestrator,executors.server,service.server,index}.ts`, NEW `src/lib/agent/discovery.ts`, NEW `src/components/scholarship/discovery-panel.tsx`, `src/app/scholarships/page.tsx` (auth state + one panel). Tests: NEW `tests/agent/discovery.test.cjs` (33), `agent.test.cjs` (1 rewritten, 1 added, fixtures moved to the new result shape), `security-static.test.cjs` (+4), `mutation.test.cjs` (+8), `run-unit.sh`. No dependency, no migration, no new route.
Results (local, mocked model, in-memory stand-in for the search): agent unit 66, discovery 33, agent static 27, mutations 33/33 killed. Regression static: search 11, details 14, admin 25, knowledge 18, assistant 16 (+26 unit), matching 22 (+55 unit/26/19 flow), documents 22+43. Several older `run-unit.sh` scripts cannot run here (TS6 `--ignoreConfig` harness issue) and were not modified.
NOT run: `npm ci/typecheck/lint/build`, `test:db`, browser/UI tests, any live Supabase, any real Gemini call.

## Repair Session 5 — details (agent reads the student's profile)
Scope: only `getStudentProfile` and what the model is given. See HANDOFF (Repair Session 5) and ADR-038. Files: `src/lib/profile/queries.ts`, `src/lib/agent/{profile,types,config,state,model,orchestrator,executors.server,tools,index}.ts`, tests `tests/agent/{profile.test.cjs,fake-supabase.cjs,run-unit.sh,agent.test.cjs,security-static.test.cjs,mutation.test.cjs}`. Results: agent unit 66, discovery 33, profile 31, static 28, 12/12 new mutants killed. Live Supabase/Gemini and the full npm gate: BLOCKED.

## Repair Session 8 — "Prepare me for this scholarship" integration (2026-10-03)

**Status: PARTIALLY_COMPLETE (wired + unit-verified; live E2E BLOCKED).**

### Working (code integration — verified by unit/static tests, not live)
- Goal `prepare_scholarship` plan: identify scholarship → requirements → profile → documents → eligibility → RAG → gaps → tasks → roadmap → summarize.
- Profile tool returns real available profile fields (Repair 5).
- Document gaps from vault `document_type` metadata (Repair 6).
- RAG scoped to one scholarship; cross-scholarship evidence dropped (Repair 7).
- Matching engine used by `checkEligibility` (Module 09).
- Tasks from server-built candidates; roadmap create (L2) / update (approval).
- Forbidden tools rejected in policy (FORBIDDEN check restored Session 8).
- API: session identity only; origin + JSON gates.

### Fixed this session
- Restored missing `def.risk === "FORBIDDEN"` check in `policy.ts` (security regression).
- Static test updates for RAG helper + migration name `match_knowledge_*`.

### Verified locally (this sandbox)
| Suite | Result |
|---|---|
| agent unit | 66 pass |
| agent documents | 18 pass |
| discovery | 33 pass |
| agent static | 29 pass |
| knowledge unit | 61 pass |
| knowledge static | 19 pass |
| assistant unit | 26 pass |
| assistant static | 16 pass |
| matching unit | 55 pass |
| matching scenarios | 22 pass |
| matching static | 26 pass |

### BLOCKED (not run — no credentials / no Postgres / no Gemini)
- Real scholarship + published data on hosted Supabase
- Real Gemini (agent + embeddings)
- Student A vs Student B isolation on live DB
- Browser prepare flow
- Approval token flow on live API
- `test:db`, full `npm ci` / lint / typecheck / build gate
- Ingested RAG corpus (empty KB → empty evidence is correct behaviour)

### Still not implemented
- Document content analysis (`analyzeDocument` → `analysis_not_supported`)
- Module 14 application workspace
- Automatic application submit (forbidden by design)

### Completion checklist (Module 13) — honest
```
[x] agent prepare plan connected in code
[x] profile retrieval wired (unit)
[x] document checking wired (unit)
[x] matching/eligibility wired (unit)
[x] RAG scope wired (unit)
[x] tasks/roadmap candidates wired (unit)
[x] approval required for updateTask/updateRoadmap (unit)
[ ] real scholarship exists — BLOCKED
[ ] public search works live — BLOCKED
[ ] filters work live — BLOCKED
[ ] matching works live — BLOCKED
[ ] profile retrieval live — BLOCKED
[ ] document checking live — BLOCKED
[ ] RAG works live — BLOCKED
[ ] real Gemini works — BLOCKED
[ ] agent works live — BLOCKED
[ ] tasks work live — BLOCKED
[ ] roadmap works live — BLOCKED
[ ] Student A isolation verified — BLOCKED
[ ] Student B isolation verified — BLOCKED
[ ] approval flow verified live — BLOCKED
[ ] browser flow verified — BLOCKED
```

## Module 14 — Application Workspace (2026-10-03)

**Status: PARTIALLY_COMPLETE.**

Implemented: `/applications`, `/applications/[id]`, `src/lib/applications/*`, start-application on scholarship detail, header/dashboard links, ADR-037.

Verified locally: validation 6, static 8.

**BLOCKED:** live Supabase, browser E2E, `test:db`, full lint/typecheck/build.


## Module 16 — Application Review (2026-10-03)

**Status: PARTIALLY_COMPLETE.**

Implemented: `src/lib/review/*` (completeness, consistency heuristics, deadline, eligibility mapping, health aggregation), `loadApplicationHealth` server loader, `ReviewPanel` on `/applications/[id]`, ADR-040, `npm run test:review`.

Verified locally: validation 16, security-static 44.

**BLOCKED:** live Supabase, browser E2E, real eligibility against hosted data, `test:db`, full lint/typecheck/build.


## Module 17 — Mentor Community (2026-10-03)

**Status: PARTIALLY_COMPLETE.**

Implemented: migration `20261003000400_mentor_community.sql` (stories, timelines, questions, answers + admin verification grants/policies); `src/lib/mentors/*`; apply + dashboard + admin verification UI; public `/mentors` list/stories/Q&A and `/mentors/[id]`; ADR-041; `npm run test:mentors`.

Verified locally: validation 10, security-static 31.

**BLOCKED:** live Supabase, browser E2E, real admin verify flow, optional `set_user_role` elevation.


## Module 18 — Admin + Production Hardening (2026-10-03)

**Status: PARTIALLY_COMPLETE.**

Implemented: migration `20261003000500_reports_and_hardening.sql`; `src/lib/admin/*`; admin nav + overview stats; users, reports, sources, RAG, audit, settings pages; report submit/status actions; security headers; enhanced `/api/health`; ADR-042; `npm run test:admin`.

Verified locally: validation 6, security-static 32.

**BLOCKED:** live Supabase, full E2E moderation, deploy pipeline.
