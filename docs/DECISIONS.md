# ScholarPath PK — Architecture Decision Log

## ADR-001 — Next.js

**Decision:** Use Next.js + TypeScript.

**Reason:** Requested stack, strong web ecosystem and direct Vercel compatibility.

**Status:** LOCKED

## ADR-002 — Supabase Backend

**Decision:** Use Supabase for Auth, PostgreSQL, Storage, Edge Functions and pgvector.

**Reason:** Free-first architecture and reduced infrastructure complexity.

**Status:** LOCKED

## ADR-003 — Gemini Primary AI

**Decision:** Gemini is the primary AI provider.

**Reason:** Suitable free-tier access for MVP use, subject to quotas.

**Status:** LOCKED unless a better verified free-first option is required.

## ADR-004 — Grok Fallback

**Decision:** Grok is an optional fallback provider behind an AI abstraction.

**Reason:** Provider independence and resilience. Do not assume unlimited free API access.

**Status:** LOCKED

## ADR-005 — RAG in Supabase

**Decision:** Use pgvector inside Supabase for scholarship/source knowledge retrieval.

**Reason:** Avoid a separate vector database during MVP.

**Status:** LOCKED

## ADR-006 — Official Sources as Authority

**Decision:** Official provider/university/government sources are the authority for scholarship facts.

**Reason:** Reduce hallucination and outdated-information risk.

**Status:** LOCKED

## ADR-007 — AI Does Not Submit Applications

**Decision:** The platform assists with preparation but the student submits on the official portal.

**Reason:** User control, safety and reliability.

**Status:** LOCKED

## ADR-008 — Rules Before LLM

**Decision:** Use SQL/code for simple filtering, dates and hard eligibility whenever possible.

**Reason:** Lower cost, faster response and more deterministic behavior.

**Status:** LOCKED

## ADR-009 — Human Approval Gates

**Decision:** Consequential actions require user approval.

**Reason:** Prevent unintended or incorrect application actions.

**Status:** LOCKED

## ADR-010 — One Module Per AI Session

**Decision:** AI coding sessions work on one module at a time and must create a handoff.

**Reason:** Limited context and reliable continuity.

**Status:** LOCKED

## ADR-011 — System Font Stack (no `next/font/google`)

**Decision:** Use a system font stack instead of fetching Google Fonts at build time.

**Reason:** Zero extra dependencies, no build-time network dependency, faster and more portable (Pakistan-network friendly). Self-hosted fonts can be added later via `next/font/local`.

**Status:** OPEN to change (cosmetic only).

## ADR-012 — shadcn/ui Set Up Manually

**Decision:** shadcn/ui is configured via `components.json`, `cn()` helper and hand-added `button`/`card` primitives (new-york style, Tailwind v4 CSS variables).

**Reason:** The shadcn CLI registry was not reachable in the Module 01 build environment. The setup is CLI-compatible: `npx shadcn@latest add <component>` should work.

**Status:** LOCKED (stack unchanged; only the install method differed).

## ADR-013 — Auth Uses Supabase Auth via Server Actions + `@supabase/ssr` Cookies

**Decision:** Email/password auth runs through Next.js Server Actions calling Supabase Auth with cookie-based sessions (`@supabase/ssr`), PKCE email links handled by `/auth/callback`. No separate auth system.

**Reason:** Matches ADR-002 and SECURITY.md (server-side enforcement, no tokens in JS-readable storage).

**Status:** LOCKED.

## ADR-014 — Two-Layer Route Protection

**Decision:** `src/proxy.ts` (Next.js 16 proxy) refreshes the session and redirects unauthenticated users (using `getClaims()`); every protected page must ALSO verify server-side with `requireUser()`/`requireRole()` (using `getUser()`). The `(protected)` layout is only a backstop, since layouts do not re-run on client navigation.

**Reason:** Proxy checks are optimistic and must not be the only line of defense. Verified by disabling the proxy in a test: pages still redirect and leak nothing.

**Status:** LOCKED.

## ADR-015 — TEMPORARY Role Source: `app_metadata.role`

**Decision:** Until Module 03 creates `profiles`, the role is read from `app_metadata.role` (writable only by service role/dashboard). Missing or unknown values mean `student`. `user_metadata` is never trusted. Signup never sends a role.

**Reason:** Satisfies "no self-granted roles" without creating the profiles schema early.

**Status:** SUPERSEDED by ADR-018 (Module 03). `app_metadata.role` is no longer read by the app; it is only used once, by the Module 03 migration, to backfill `profiles` for pre-existing users.

## ADR-016 — `/mentors` Is Public; `/mentor/*` Is Protected

**Decision:** `/mentors` and `/mentors/[id]` stay public; the protected mentor area is `/mentor/*` (`/mentor/apply` for any signed-in user; the rest mentor/admin).

**Reason:** `PAGES_AUTHORIZATION.md` marks `/mentors*` public for guests. The Module 02 prompt listed `/mentors` among protected routes; this looks like a typo for `/mentor`. Flip by adding `/mentors` to `PROTECTED_PREFIXES` in `src/lib/auth/routes.ts` if protection was truly intended.

**Status:** LOCKED unless the product owner decides otherwise.

## ADR-017 — Removed Root `loading.tsx`

**Decision:** Deleted `src/app/loading.tsx` (a Module 01 placeholder).

**Reason:** A root loading boundary makes the response stream before page-level `redirect()` runs, so redirects came back as HTTP 200 + meta-refresh instead of a real 307. Add `loading.tsx` per-segment later if needed, not at the root.

**Status:** LOCKED.

## ADR-018 — `profiles.role` Is the Permanent Role Source

**Decision:** `public.profiles.role` (`student|mentor|admin`, default `student`) is the single source of truth. The app reads it with the user's own session (RLS: own row only) in `getCurrentUser()` and in the proxy for role-restricted paths. Roles are never read from the JWT, `app_metadata` or `user_metadata`. A missing profile or failed lookup means `student` in pages and **denied** in the proxy (fail closed).

**Reason:** Satisfies SECURITY.md (server-side + database enforcement) and DATABASE.md. Not putting the role in the JWT avoids needing a Custom Access Token Hook (a dashboard setting we cannot verify from CI) and makes role changes effective immediately instead of after token refresh (fixes the Module 02 "role changes lag" known issue).

**Cost:** one indexed `profiles` lookup on `/admin` and `/mentor/*` requests in the proxy, and one per authenticated `getCurrentUser()` call (cached per request).

**Status:** LOCKED.

## ADR-019 — Roles Change Only Through the Service Role

**Decision:** No client role (anon/authenticated, including admins) can write `profiles.role`: there is no column grant, and a `BEFORE UPDATE` trigger blocks it even if a grant is added by mistake. New users are always `student` (the `on_auth_user_created` trigger hard-codes it and never reads metadata). The only supported path is `public.set_user_role(target, role, acting_admin)`, executable by `service_role` only, which validates input and appends to `admin_actions`. First admin: run it (or the README SQL) in the Supabase SQL editor. Mentor promotion must happen from a server-side verification flow (Module 17) calling `set_user_role`; admin/mentor verification UIs (Module 18/17) must call it from server code with the service key, never from the browser.

**Reason:** "Admin cannot be self-created", "mentor verification cannot be self-granted" (SECURITY.md/ARCHITECTURE.md).

**Status:** LOCKED.

## ADR-020 — Least-Privilege Grants on Top of RLS

**Decision:** Supabase auto-grants broad privileges on new public tables; Module 03 revokes them for `anon`/`authenticated` and re-grants minimally, using column-level grants to make server-owned columns (role, ownership keys, `verification_status`, `verified_at`, `processing_status`, `extracted_text_reference`) unwritable by clients. Admin write access exists only for catalog data (countries, universities, programs, scholarships, sources, requirements) and the audit log. Admins can *read* profiles, education, experiences, applications, tasks and mentors, but have **no** policy on `documents` or the `documents` storage bucket (PAGES_AUTHORIZATION: "restricted"); admin access to those must be an explicit server-side operation.

**Status:** LOCKED. Every future migration must enable RLS and set grants explicitly.

## ADR-021 — Module 03 Schema Scope

**Decision:** Created only the tables the Module 03 prompt lists (profiles, education, experiences, documents, countries, universities, programs, scholarships, scholarship_sources, scholarship_requirements, applications, application_tasks, mentors) plus `admin_actions` (required by SECURITY.md "Audit" and by `set_user_role`). Deferred to their modules: `scholarship_documents`, RAG tables (+pgvector), `application_documents`, `application_drafts`, `mentor_stories/timelines/answers`, `reports`, `ai_*`. Enumerations are `text` + `CHECK` only where DATABASE.md or security needs a fixed set (`role`, `funding_type`, scholarship `status`, mentor `verification_status`, document `processing_status`); other status/type columns stay free text until their module defines them. Deliberate small additions: `created_at/updated_at` on user-editable tables (DATABASE.md conventions), `http(s)` CHECKs on URL columns, document MIME/size/path CHECKs, `UNIQUE(mentors.user_id)`.

**Status:** LOCKED; later modules extend via new migrations.

## ADR-022 — Private `documents` Storage Bucket

**Decision:** Bucket `documents` is private, 10 MB limit, MIME allow-list (PDF, JPEG, PNG, DOCX). Path convention `<user_id>/<file>`; owner-only select/insert/update/delete policies on `storage.objects`; `public.documents.storage_path` is CHECK-constrained to the owner's folder. Access via signed URLs only; no public URLs.

**Status:** LOCKED.

## ADR-023 — Public Reads Use a Cookie-less Anon Client

**Decision:** Public pages read through `src/lib/supabase/public.ts` (`createPublicClient()`): anon key, no cookies, no session persistence, `server-only`. It returns `null` when Supabase env is missing so pages render a fallback instead of crashing builds/tests. All public queries live in `src/lib/public/queries.ts`, select explicit columns (never `*`; `scholarship_sources.content_hash` is never selected) and convert DB errors into a generic `PublicDataError` (logged server-side only).

**Reason:** Results must not depend on who is signed in. The cookie-bound client would also change `mentors` visibility for owners/admins (own/pending rows), which would corrupt a public count. RLS stays the only gate; no policy was changed.

**Status:** LOCKED.

## ADR-024 — `/mentors` Shows Aggregates Only Until Module 17

**Decision:** `mentors` has no display name and no publish-consent flag, and profiles are private. `/mentors` therefore shows an introduction, the official-vs-personal-experience distinction, and only a verified-mentor COUNT (anon + RLS). No individual mentor is listed, no `user_id` is read, and no `mentor_*` tables were created.

**Status:** LOCKED until Module 17 defines a public mentor profile/consent model.

## ADR-025 — Root Layout Auth Read Left in Place (Review Result)

**Decision:** The "every route is dynamic" issue was reviewed. The header still calls `getAuthState()` (reads cookies) so routes remain dynamic. Public page data code is already cookie-free, so the pages become cacheable the moment the header is isolated. The isolation was NOT done in Module 04 because the Module 02 e2e suite asserts the server-rendered header ("Log out"/"Log in"/"Sign up") and it could not be run in this session.

**Recommended fix (follow-up):** render the signed-out header on the server and swap in an auth-aware client component (browser client `getClaims()`), update the two e2e header assertions accordingly, then add `export const revalidate = 3600` to the static-friendly public pages.

**Status:** OPEN (performance only; no security impact).

## ADR-026 — Display Rules for Scholarship Facts

**Decision:** Missing values render "Information not available." and are never inferred. Fields absent from the schema (e.g. application process, fee currency) are not shown or invented. Funding labels never promise that "fully funded" covers every cost. Only `http(s)` URLs become links (re-validated at render). Source ordering assumes a LOWER `scholarship_sources.priority` number = more trusted (matches the 1–5 source-priority list in the prompt); Module 07/10 must confirm.

**Status:** LOCKED unless the schema changes.

## ADR-027 — Student Profile Scope and Ownership (Module 05)

**Decision:** (1) `profiles.date_of_birth` is NOT collected: no current module needs it (age-limited scholarships belong to matching, Module 09; add it there if a rule truly needs it). The column and its client grant stay untouched. (2) Mutations are Server Actions on the cookie-bound anon client; ownership is derived from `auth.getUser()` and the caller's own `profiles.id` (never from form data), and RLS/column grants remain the enforcement layer. The service-role client is not used for student CRUD. (3) The app sends only whitelisted columns and validates everything on the server (allow-listed `level` / `experience_type` values, length limits matching the DB, strict dates, plain-decimal CGPA). (4) `education.level` and `experiences.experience_type` are free text in the schema; the app restricts them to fixed lists (`src/lib/profile/types.ts`), which Module 09 can map to scholarship `degree_level`. (5) Completion is derived at read time (`src/lib/profile/completion.ts`), nothing is stored.

**Reason:** Least data, least privilege, and no schema change when the Module 03 schema already supports the feature.

**Known schema gap:** `education.cgpa` / `cgpa_scale` are `numeric(4,2)` (max 99.99), so a 100-point percentage scale cannot be stored; the app rejects it with an explanatory message. If percentage scales matter, add a NEW migration widening both to `numeric(5,2)` (never edit applied migrations) and lift the check in `validation.ts`.

**Status:** LOCKED unless the schema changes.

## ADR-028 — Document Vault Architecture (Module 06)

**Decision:** (1) **Zero migrations.** The Module 03 `documents` table, column grants, RLS and `documents` bucket policies are used unchanged. (2) **Upload is a Server Action** (`src/lib/documents/actions.ts`) on the cookie-bound anon client, not a service-role upload and not a browser-direct Storage upload. The server resolves the user with `auth.getUser()`, validates the file from its actual bytes (size, extension, browser MIME consistency, magic-byte signature), derives the stored MIME itself, and builds the object path as `<session user id>/<random uuid>.<ext from the verified type>`. The browser sends only the file and an optional allow-listed document type. The original name is never part of the path; a sanitized copy is stored in `file_name` for display. (3) **View/download** is `GET /documents/[id]/file[?download=1]`: authenticate, look the row up with the caller's own client + `user_id` filter, mint a **60-second signed URL** for the path read from that row, 302 to it. Unknown / foreign / malformed ids return the same generic 404. No public URLs are ever created. (4) **Delete order: Storage object first, then the DB row.** If Storage fails nothing changes; if the row delete fails after the object is gone, the row stays visible and deletable and a retry is safe (removing a missing object is a no-op). The reverse order could leave an invisible, undeletable object. If Storage reports "removed nothing", the object's existence is checked before the row is deleted. (5) **Upload rollback:** if the DB insert fails after the object was stored, the object is removed. If both fail, only a safe error code is logged. (6) `documents.document_type` is nullable free text in the schema; like ADR-027, the app restricts it to a fixed list (`DOCUMENT_TYPES` in `src/lib/documents/constants.ts`) and treats it as optional. Later modules (`scholarship_documents.document_type`) should map to this list. (7) `processing_status` is NOT shown: it is server-owned and nothing processes documents before a later module, so "pending" would mislead. (8) Rename/edit of metadata is not offered (not requested), although the grant allows `file_name`/`document_type` updates.

**Config:** `experimental.serverActions.bodySizeLimit = "11mb"` in `next.config.ts` (default is 1 MB). It applies to all Server Actions; the file itself is still capped at 10 MB by the action, DB and bucket.

**Reason:** Reuse the established Module 02/03/05 security pattern (server identity, cookie-bound client, RLS authoritative) and avoid any second auth mechanism or a service-role bypass.

**Known limits:** a double-submit from two browser tabs can create two documents (a single tab is guarded in the UI); the signature check is a sanity check, not malware scanning; DOCX detection requires `word/document.xml`; the Server Action buffers up to 10 MB in memory; hosting platforms with a lower request-body cap than ~10 MB (e.g. some serverless limits) would reject large uploads before the action runs — to be checked at deployment.

**Status:** LOCKED unless the schema or Storage policies change.


## ADR-029 — Admin Scholarship Management (Module 07)

**Decision:** (1) **Zero migrations.** The Module 03 `scholarships` / `scholarship_sources` schema, `scholarships_admin_all` RLS (via `is_admin()`), grants and `admin_actions` audit table are used unchanged. (2) Admin pages live under `/admin/scholarships` (inside `(protected)`), each calling `requireRole(["admin"])`; every Server Action in `src/lib/admin-scholarships/actions.ts` re-authenticates with `auth.getUser()` and requires `profiles.role = "admin"` (own row, cookie-bound client) before touching data. The service-role client is not used. (3) Create always inserts `status = 'draft'`; the edit form cannot write `status` or `last_verified_at`; status changes go through a transition table (`draft→active|archived`, `active→draft|archived`, `archived→draft`, so archived items must be restored before they can be published) with a conditional update. (4) Delete is refused when the scholarship is active or has applications (the DB `ON DELETE RESTRICT` is the backstop); archive is the normal retirement path. (5) A university must belong to the chosen country (checked in the action; the DB does not enforce it). (6) Duplicate guard (name + provider + country) is application-level only; there is no unique constraint. (7) Every mutation appends an `admin_actions` row (field names/ids only, no values); audit failure is logged but does not roll back the mutation (best-effort). (8) Curated data: JSON import (drafts only, atomic, max 50) — see `docs/DATA_IMPORT.md`; no dataset is shipped. (9) `last_verified_at` is set only by an explicit admin "Mark verified now" action. Public pages/queries are unchanged.

**Known gaps:** no admin UI for countries/universities/programs/requirements; no currency column for fees; the audit write is not transactional with the mutation; no rate limiting.

**Status:** LOCKED unless the schema changes.

## ADR-030 — Public Search and Filters (Module 08)

**Decision:** (1) **No migration.** With the expected dataset size (module plan: roughly 100–300 scholarships) a sequential scan with `ILIKE` is fast, so no `pg_trgm`/full-text index is justified yet; revisit if the public dataset grows into the thousands or search latency is measured. (2) Keep Module 04's architecture: GET form → URL query params → Server Component → anon public client. Visibility is decided only by RLS (`scholarships_select_active`); the app never adds or removes a status filter. (3) Search = tokens (max 5, each ≤ 40 chars, `escapeSearch`-sanitised) that must ALL match; each token may match name, provider, field, degree_level, eligibility_summary, or the name of the scholarship's university or country. University/country names are resolved with two batched lookups (not per row) into UUID lists, validated before being placed in `or()`. (4) URL contract: `q` (alias `search`), `country` (slug), `university` (slug), `degree`, `field`, `funding`, `deadline` (30|90|180), `open=1`, `sort`, `page`. Unknown or malformed values are dropped; an unknown university slug returns no results rather than all. Country is a slug, not a display name (`?country=germany`). (3) Filter options come from public rows only (`degree_level`, `field`, universities that have a public scholarship); the facet query is capped at 1000 rows. (4) The text box submits on Enter/Apply; selects and the checkbox auto-submit via a tiny client component (progressive enhancement). (5) Query failures render `UnavailableState`.

**Known limits:** phrase search is not supported (words are ANDed); no relevance ranking (ordering is by deadline or name); `degree_level`/`field` are free text so different spellings produce separate filter options (data-quality, see Module 07); no stemming or typo tolerance; facet options are computed from at most 1000 rows; the `_` character acts as a one-character wildcard inside ILIKE.

**Status:** LOCKED unless the schema or dataset size changes materially.

## ADR-031 — Eligibility + Matching Engine (Module 09)

**Decision:** A deterministic, explainable, AI-free engine in `src/lib/matching/` (pure functions, no I/O, no clock — the caller passes today's date). Only `queries.ts` touches Supabase. No migration, no new dependency.

**Data reality that shaped the rules:** `scholarships` has `degree_level` and `field` as free text, `minimum_gpa` + `minimum_gpa_scale`, and two free-text summaries; **it has no nationality, age, language-score or preference columns**. `scholarship_requirements` rows are free text (`requirement_type`, `title`, `description`, `required`; `structured_value` has no defined shape and there is no admin UI for the table). The student profile has nationality, city, and per-education `level` (enum), `field` (free text), `cgpa`, `cgpa_scale`, `start_date`, `expected_graduation`; it has **no** country/university preferences and no language test data. Only comparisons possible on this data are implemented.

**Rules** (`eligibility.ts`; each yields a check with outcome `met | not_met | unknown | not_applicable | info`):
1. **Degree level — mandatory.** Scholarship text is mapped to bachelor/master/phd (synonyms like MSc, MPhil, undergraduate, postgraduate; "any level" = no restriction; unrecognised text = `unknown`). Student rank: intermediate 2 < bachelor 3 < master 4 < phd 5 (the profile's "Other" is ignored). Target already held or exceeded → `not_met`; one step below the target and *completed* (graduation date ≤ today) → `met`; in progress or undated → `unknown`; PhD with only a Bachelor's → `unknown` (some accept it); anything further below → `not_met` ("add higher qualifications if you have them"). Several target levels: the most favourable wins. No education at all → `unknown` (never `not_met`).
2. **Field — relevance only, never eligibility.** Word-overlap (stop-words removed; shared word or a ≥5-char prefix relation) between the scholarship field and the student's *latest* education field. "Any/all fields"/empty = unrestricted. No overlap → `not_met` for the field check, but the status is untouched; the scholarship is only marked **not relevant** (hidden by default, revealable). Missing student field → `unknown`.
3. **Minimum GPA — mandatory when stated.** Ratio comparison (cgpa/scale vs min/min_scale). Uses the highest education record *below* the target level (falls back to any record with a CGPA). Same scale: exact. Different scales: converted proportionally, flagged as an approximation, and a shortfall under 5 points is `unknown` instead of `not_met`. Missing/invalid numbers or scale → `unknown`.
4. **Requirement rows** — always `unknown` (text cannot be verified); mandatory only when `required` is true.
5. **English / eligibility summaries** — shown as `info` ("not checked"); never change the status.
6. **Nationality is deliberately NOT evaluated** (no scholarship-side data). The profile nationality is loaded but unused; it is not requested as a "missing" item either.

**Status derivation** (`deriveStatus`): any mandatory `not_met` → *Not eligible*; else any mandatory `unknown` → *Possibly eligible* if at least one check is `met`, otherwise *Insufficient information*; else (all mandatory known and met) → *Likely eligible* if at least one check is `met`, else *Insufficient information*. Optional unknowns never lower the status. "Likely" means "every requirement we *can* check appears met" and the UI says to confirm officially.

**Matching/selection:** candidates = what the anonymous RLS view returns (status `active`; ADR-023/030 — **no status filter is added in SQL**, and the engine additionally excludes anything whose status is not exactly `active`, so even a mis-configured policy cannot surface drafts/archived on this page, including for admins whose cookie-bound client would see them). Closed scholarships (deadline < today, the same rule as `deadlineState()`) are filtered in SQL by default and shown last, labelled, with `?closed=1`; missing/invalid deadlines are kept as "Deadline not listed". Not-relevant scholarships (field/level mismatch) are hidden by default and revealable with `?show=all`, with a visible count. `not_eligible` due to GPA/prerequisites is shown (labelled with reasons) so the student can see why.

**Ordering** (`rank.ts`): eligibility tier (likely, possibly, insufficient, not eligible) → open/unknown before closed → more `met` checks → nearest deadline (none last) → name → id. `metCount` is shown only as "N of M checks matched your profile" — **no score, no percentage, no probability**.

**Architecture/security:** student data via the cookie-bound client with the user id from `requireUser()` (the only query params are `show`, `closed`, `page`; forged `user_id`/`profile_id` are ignored); scholarships + requirements in ONE bounded query (`limit 501`, explicit columns, requirements embedded — no N+1) via the cookie-less anon client; no service-role client; raw errors never shown (generic unavailable state; only error code/name logged). `/matches` is protected by the proxy prefix and `requireUser()` in the `(protected)` layout.

**Known limits:** evaluation runs in application code over at most 500 candidates (`CANDIDATE_LIMIT`; a notice is shown if hit) — fine for the planned ~100–300 scholarships; revisit (SQL pre-filtering) beyond that. Free-text `degree_level`/`field` mean synonyms the parser does not know are `unknown` (level) or look "unrelated" (field, hidden-but-revealable). `structured_value` is not interpreted. GPA conversion between scales is proportional only.

**Status:** LOCKED unless the schema gains structured eligibility data (then extend `eligibility.ts`, keep the status derivation and the "missing ≠ ineligible" rule).

## ADR-032 — Scholarship Detail Page: Verification, Sources and Pakistan-side Section (Module 10)

**Decision:** The Module 04 detail page `/scholarships/[id]` is extended, not replaced. Presentation rules live in the pure module `src/lib/public/detail.ts` (no I/O, explicit `today`); data still comes only from the existing anon query `getScholarshipById` (one added column: `scholarship_requirements.source_id`).

1. **Verification is never assumed.** A missing, unparsable or future `last_verified_at` renders a prominent "Not verified yet" notice; an age above `STALE_AFTER_DAYS` (180, a display heuristic, not a product rule) renders "may be out of date"; even a recent date only says "last verified … can still change". The page never says "confirmed".
2. **Sources are shown as recorded.** "Official links" = only the `official_*_url` columns and the university website; "Recorded sources" = `scholarship_sources` rows with their stored type, host and verified date. A source's type is never upgraded to "official" by the app. Every link is http(s)-only (`linkView`, re-validated at render), shows its host, opens with `rel="noopener noreferrer"`. Requirements show the source they point to (`source_id`) only when that source is publicly visible (RLS hides inactive sources); otherwise no attribution is claimed.
3. **Application window** (`applicationPhase`): deadline passed → closed (wins over everything); opening date in the future → upcoming; no/invalid deadline → "Deadline not listed" (never "open"/"closed"). Times and time zones are not stored and the page says so.
4. **Pakistan-side section — data convention (the roadmap asks for it; the schema has no table for it).** Rows of `scholarship_requirements` with `requirement_type = 'pakistan_side'` (compared case/space/hyphen-insensitively) are shown in their own section "For applicants in Pakistan"; rows without a recorded source are flagged "unconfirmed". With no such rows the section says nothing has been recorded yet. **The app contains no HEC/IBCC/MoFA or other Pakistani-authority guidance of its own** (PRD FR-024: guidance must be verified, source-linked and opportunity-specific). No migration. There is still **no admin UI for requirement rows** (Module 07 manages sources only), so these rows can currently only be created with SQL/service access; an admin editor is future work.
5. **Draft/archived/missing are indistinguishable** to every visitor (RLS hides them; page and queries add no status filter; 404). Admins get no draft preview here (use `/admin/scholarships/[id]`).
6. **Approved Module 09 behaviour changed in exactly one way:** `src/lib/matching/eligibility.ts` skips `pakistan_side` rows. Reason: the engine turns every requirement row into a mandatory "needs confirmation" check, so process steps stored under this convention would have demoted students from *Likely* to *Possibly eligible*. Everything else in ADR-031 is unchanged; a regression test covers it. The literal is duplicated in `detail.ts` and `eligibility.ts` (matching compiles as a standalone unit) and a static test asserts they match.
7. Navigation: breadcrumb-style links to `/scholarships` and `/matches` (guests are redirected to login by the existing guard). Cards keep linking to `/scholarships/[id]` unchanged (existing tests pin that URL), so the page does not know where the visitor came from.

**Status:** LOCKED until requirement rows get structure/admin tooling or Pakistan-side data gets its own table (then migrate the convention and remove the matching exception).



## ADR-033 — RAG Knowledge Base: ingestion, storage, embeddings, retrieval (Module 11)

**Status:** ACCEPTED for implementation; live behaviour NOT verified (see HANDOFF). Source of truth for Module 11.

**Context.** `docs/MODULES.md`: "Source ingestion, extraction, chunking, embeddings, pgvector, metadata and retrieval." `docs/RAG.md` and `docs/DATABASE.md` §5 define the shape; ADR-003 (Gemini primary, behind an abstraction) and ADR-005 (pgvector in Supabase) fix the provider and store. Module 11 is **backend-only**: no page, no dashboard feature. The assistant (Module 12) and admin RAG management UI (Module 18) are out of scope.

1. **Source eligibility (no rule existed; this is it).** The schema has no "verified"/"official" flag and `scholarship_sources.source_type` is free text. A source is eligible for ingestion iff `source.active` ∧ `scholarship.status = 'active'` ∧ `last_verified_at` is a valid, non-future timestamp ∧ the URL passes validation (§3). `source_type` and `priority` are copied as recorded and **never interpreted, upgraded or used to claim "official"**. A never-verified or future-dated source is "not verified" (consistent with ADR-032) and is not ingested. Implemented in `eligibility.ts`; the same visibility conditions are enforced again in SQL at retrieval time (so un-verifying a source or archiving a scholarship immediately removes its chunks from retrieval, even before any re-ingestion).
2. **Formats.** `text/html`, `application/xhtml+xml`, `text/plain` only. **PDF is deliberately unsupported**: it needs a parser dependency that could not be installed/reviewed here, and the task forbids silently accepting unsupported formats. A PDF source ends as `failed` / `unsupported_content_type` (retryable once PDF support exists). `RAG.md` lists PDF/upload ingestion; that is deferred, not dropped. HTML extraction is a small dependency-free, deterministic extractor (drops script/style/nav/footer/aside/form; h1–h3 become `section`; entities decoded). It does not execute JS, so JS-rendered pages yield little/no text (→ `empty_content`).
3. **URL/retrieval security (SSRF).** Stored URLs are untrusted. Only http/https; no credentials; ports 80/443 only; no `localhost`/`.local`/`.internal`/single-label hosts; IPv4/IPv6 literals (including decimal/hex/octal forms, v4-mapped, NAT64, 6to4, ULA, link-local, multicast, documentation) blocked; hostnames are DNS-resolved and **every** address must be public; redirects are `manual`, max 3, each hop re-validated before it is requested; 2 MB streamed size cap and 15 s total timeout; content-type allow-list; no cookies/credentials sent; the admin route never accepts a URL (only a source id). **Known limitation:** DNS is resolved by us and again by the HTTP client, so DNS rebinding is not fully closed (needs IP pinning via a custom dispatcher) — hardening item for Module 18. Port 80/443-only will also reject legitimate sources on other ports; that is an accepted trade-off.
4. **Embeddings.** Provider behind `EmbeddingProvider` (`embeddings.ts`); implementation `GeminiEmbeddingProvider` for `gemini-embedding-001` via `models/gemini-embedding-001:embedContent` (checked against Google's docs in this session), **768 dimensions** (`outputDimensionality`, Google's recommended size; the column is `vector(768)`), `RETRIEVAL_DOCUMENT` for chunks and `RETRIEVAL_QUERY` for queries, vectors L2-normalized locally (only the 3072-dim output is pre-normalized by Google). Responses are validated (exact length, finite numbers, not all-zero) before storing; failures map to short codes. Key only in the `x-goog-api-key` header, server-only (`getAiKeys()` in `service.server.ts`). Input limit is 2048 tokens, hence ~1000-char chunks. **No fake embedder exists**; tests use injected mocks and are labelled as such. Changing model/dimension requires a new migration and re-embedding (stored `embedding_model`/`embedding_dimensions` make stale rows detectable; re-ingestion is automatic when they differ).
5. **Schema (migration `20261002000100_rag_knowledge_base.sql`).** `knowledge_documents` (one row per source: `source_id` UNIQUE FK → `scholarship_sources` ON DELETE CASCADE, `scholarship_id`, `topic_type`, `title`, snapshot `source_url/source_type/source_priority/last_verified_at`, `version`, `content_hash`, `processing_status` pending|processing|ready|failed, `error_code`, `chunk_count`, `embedding_model/dimensions`, `chunking_version`, `last_attempt_at`, `ingested_at`, `active`) and `knowledge_chunks` (`content`, `embedding vector(768)`, `chunk_index`, `page_number` (always null for HTML), `section`, `metadata` jsonb, `content_hash`; UNIQUE(document, index); HNSW cosine index). These are the DATABASE.md §5 fields plus the operational columns above. `error_code` is CHECK-constrained to `^[a-z0-9_]{1,64}$`, so raw errors, URLs, keys or page content cannot be stored there. `scholarship_sources.content_hash` (Module 07-owned) is **not** written; the hash lives in `knowledge_documents`.
6. **Access model.** RLS enabled; all default privileges revoked from `public/anon/authenticated`. `authenticated` has SELECT only, and only an `is_admin()` policy (processing status/errors are private ingestion metadata); no client write path for anyone. Writes use the **service-role** client in `store.server.ts` (`server-only`) — required because ingestion is a system job with no per-user owner and the tables deliberately have no client write policies. Retrieval is `match_knowledge_chunks()` — `SECURITY INVOKER`, `EXECUTE` for `service_role` only, with the visibility conditions (active document + ready + active source + verified + active scholarship) inside the query, because the service role bypasses RLS. Module 12 must authorize the student, then call `retrieve()` server-side; students never query these tables directly. Chunks hold only text fetched from public scholarship URLs; no student data. Public scholarship visibility rules (Modules 03/04/10) are untouched.
7. **Ingestion workflow** (`pipeline.ts`, stages individually tested): load source → eligibility → (skip if another attempt started < 15 min ago) → mark `processing` → fetch → extract+normalize → content hash → **unchanged?** (same hash, chunking version, model, dimensions → mark `ready`, no embedding cost) → chunk → embed → validate → replace chunks → `ready` (version+1). Any failure → `failed` + short code. Not a single DB transaction (supabase-js has none): retrieval ignores any document not `ready`, and `ready` is set only after all chunks are stored. Consequences, accepted: during re-ingestion a document is temporarily not retrievable; two simultaneous ingestions of the same source can race (benign/deterministic, but one may record `failed`) — admin-triggered and rare.
8. **Chunking** (`chunk.ts`, version `v1-paragraph-1000-1400-150`): deterministic; never crosses a section; paragraphs packed to ~1000 chars; oversized paragraphs window-split at ≤1400 with ~150 overlap; tiny trailing fragments (<80) merged into the previous chunk when they fit; short facts are kept, never dropped; > 300 chunks → `too_many_chunks` (no silent truncation). Embedding input = title + section + content; stored content is exactly the extracted text.
9. **Retrieval** (`retrieve.ts` → SQL): query 3–500 chars (normalized), limit 1–20 (default 8), optional scholarship filter (UUID) and optional `minSimilarity`. Returns chunk text + section/page/index + source `{id,url,name,type-as-recorded,priority,lastVerifiedAt}` + scholarship id + **raw cosine similarity** (`1 − cosine distance`). It is not a probability or correctness score and is never presented as one. **No similarity threshold is applied by default** and no number is claimed as "good": choosing a cut-off needs the RAG benchmark in `RAG.md` (Module 12). Limits 8/20 are context-size choices, not tuned values. Rows with missing evidence/source or a non-http(s) URL are dropped. Retrieval does not decide that a passage "proves" a requirement; that judgement belongs to Module 12 with refusal on weak evidence. Note: pgvector HNSW with `WHERE` filters can return fewer than `limit` rows when filters are selective (post-filtering); acceptable at MVP size, revisit with iterative scans if the corpus grows.
10. **Trigger surface.** `POST /api/admin/knowledge/ingest` (admin-only: server-verified user + `profiles.role = 'admin'`, JSON-only, same-origin check, 401/403, generic errors, `{sourceId}` or `{eligible:true, limit ≤ 10}`). It exists because without it the owner cannot run ingestion before Module 18's admin UI. No UI was added. Not audited in `admin_actions` (low-sensitivity, no data change visible to users) — revisit in Module 18.
11. **Conflicts/uncertainties documented, not silently resolved.** (a) `RAG.md` source-priority ordering vs. the unconfirmed "lower number = more trusted" assumption (ADR-026): Module 11 stores and returns `priority` but implements **no** override/ranking logic. (b) `RAG.md` lists "last verified date" as chunk metadata: returned from the live source row at query time (a stored snapshot would go stale). (c) Older tests pinned "exactly 4 migrations" (Modules 06/08/10): updated to "the four originals + only the known Module 11 migration", which still fails on any unexpected migration. (d) `AGENTS.md` asks to read `node_modules/next/dist/docs` before writing Next code; `node_modules` was unavailable, so the route handler follows the existing `/api/health` pattern and is unverified against Next 16 docs.

**Status:** LOCKED for Module 12 to build on: do not change the access model (§6) or similarity semantics (§9) without a new ADR.


## ADR-034 — RAG Assistant: grounded, cited, scholarship-scoped Q&A (Module 12)

**Status: Accepted (implemented; not live-verified).** Scope: `docs/MODULES.md` "Scholarship-scoped Q&A using retrieved evidence, citations/source display and refusal when evidence is insufficient." No Module 13 behaviour (no agent loop, tools, browsing).

1. **Flow.** `POST /api/assistant/ask` `{scholarshipId, question}` -> signed-in user (any role) -> same-origin + JSON-only -> `validateAskBody` -> RLS-bound read of `scholarships` (draft/archived/missing => 404) -> Module 11 `retrieve()` (scoped by scholarship id, limit 6) -> Gemini `generateContent` -> parsed, cited result. No second vector search, no migration.
2. **Fail closed.** Empty (or foreign-scholarship) retrieval => fixed "sources do not establish an answer" message **without calling the model**. Model output must be strict JSON; `answered` requires >=1 valid citation (numbers that exist among the supplied sources) or the request fails. `insufficient` always shows the fixed server message, never model text.
3. **Sources.** Returned sources are only the cited retrieved chunks, with fields copied from retrieval (name, url, type as recorded, section, chunk index, last verified, <=280-char excerpt). Nothing is generated or upgraded to "official".
4. **Prompt injection.** Rules are in `systemInstruction`; chunks and the question are delimited untrusted data; tag-like text that could forge a block boundary is neutralised; temperature 0; response must be JSON. This reduces, and does not eliminate, injection risk: a poisoned source can still state false facts that are then cited, which is why the source and the last-verified date are always shown.
5. **Model.** Default `gemini-3.1-flash-lite`, overridable by `GEMINI_GENERATION_MODEL` (plain id only). Chosen from Google's published lineup read in this session; **never called live**. Non-`STOP` finish reasons (e.g. MAX_TOKENS) are failures, since a truncated answer can drop a qualification.
6. **No similarity threshold** yet (needs the RAG benchmark on real data); refusal relies on retrieval emptiness + the model's `insufficient` + the citation requirement.
7. **Known gaps.** No rate limiting/cost cap on the route (none exists in the app); no conversation history (each question is independent); no answer logging/audit; no benchmark.


## ADR-035 — Agentic Scholarship Assistant: bounded, policy-gated tool orchestration (Module 13)

**Status: Accepted (implemented; not live-verified).** Scope: `docs/MODULES.md` Module 13 and `docs/AI_AGENT.md`. Nothing from Modules 14–18 was built.

1. **Architecture.** Pure, separately testable layers in `src/lib/agent/`: `config` (limits) · `types`/`state` (typed run state, pure transitions) · `plan` (deterministic goal classification + canonical plan) · `tools` (registry) · `policy` (authorization/risk/approval decision) · `approval` (signed tokens) · `model` (prompts + strict parsers) · `report` (server-built results) · `orchestrator` (bounded loop) · `validate` (request). Server-only: `executors.server.ts` (tool adapters), `service.server.ts` (wiring). Route: `POST /api/agent/run`. UI: `agent-panel.tsx`, mounted inside the existing Module 12 panel.
2. **Autonomy.** Runs are L2 (read, reason, create low-risk tasks/roadmap). Tools carry a `minAutonomy`; a run below that level cannot use them. No L3-style background monitoring is implemented (no scheduler); L3 "monitor" is limited to reporting gaps and a next action within a run. No tool performs an external action.
3. **Tool registry.** Eleven executable tools (`searchScholarships`, `getScholarship`, `getStudentProfile`, `getStudentDocuments`, `checkEligibility`, `searchRag`, `analyzeDocument`, `createTask`, `updateTask`, `createRoadmap`, `updateRoadmap`) plus six registered-but-**FORBIDDEN** names (`submitApplication`, `sendEmail`, `sendMessage`, `signDocument`, `acceptTerms`, `makePayment`) that have no executor and are always rejected. Lookup is own-property only; unknown names never reach code. Each tool has name, description, risk, auth requirement, minimum autonomy, typed input parser (extra fields dropped) and user-facing label.
4. **Risk levels.** `READ_ONLY` (7 tools) · `LOW_RISK_MUTATION` (`createTask`, `createRoadmap`; idempotent, owner-scoped, creates only) · `APPROVAL_REQUIRED` (`updateTask`, `updateRoadmap`: changes to data the student already has) · `FORBIDDEN`.
5. **Policy order (pinned by tests).** registry → forbidden → model-allow-list → identity → autonomy → run limits → input validation → one-scholarship-per-run scope → approval. The model never decides any of this.
6. **Approval.** `APPROVAL_REQUIRED` calls are never executed in the loop; the run ends `awaiting_approval` with a signed request. Token = HMAC-SHA256 over `{user, tool, validated input, expiry, nonce}`, key derived (domain-separated) from the server-only service-role key; verified with a constant-time compare; bound to the session user; 15-minute expiry; only approval-gated tools are executable from a token; input is re-validated on use. The browser can only return the token with approve/decline. **Limitation:** stateless, so a token can be replayed until it expires; the gated tools are idempotent updates, and a server-side approvals table is future work.
7. **Who proposes what.** The model proposes (a) optional plan steps, (b) up to two `searchRag` calls, (c) conflict findings, (d) a summary sentence. It can **not** propose any other tool (rejected `not_allowed_now`, counted). Task/roadmap content is built by the server from the scholarship record and missing items (`report.ts`), so the model cannot add requirements or tasks. Required steps (identify, requirements, profile, eligibility, gaps, summarise) cannot be omitted.
8. **Loop limits** (`config.ts`): 24 iterations, 20 tool calls, 6 model calls, 3 rejected proposals, 60 s, 24 000 characters of tool output. Hitting any ends the run with a structured `termination` and a partial report. No unbounded loop exists (statically asserted).
9. **State.** Typed `AgentState` (goal, plan, steps, tool-call log, scholarship, profile, documents, evidence, requirements, eligibility, missing, tasks, roadmap changes, approvals, conflicts, errors, counters, final report, termination). Holds no secrets; the browser receives `PublicRun` (progress labels, report, approval requests), never raw state, user id or tool inputs.
10. **Grounding.** Scholarship facts come from the RLS-visible scholarship record (requirements are copied, not generated) and retrieved verified chunks (copied with source/url/type/section/verified date/excerpt). Student facts come only from authorized tools. Eligibility reuses the deterministic Module 09 engine mapped to `eligible / not_eligible / unknown / needs_information`; `eligible` only when every checkable documented criterion is met, and the result always lists what was **not** evaluated (nationality, age, test scores, free-text summaries). Model wording is shown only if every number in it appears in the verified state. Conflicts: the model may only flag them; each needs ≥2 valid source numbers; they are surfaced as `CONFLICTING_INFORMATION` with the sources and the next action says to verify. The server never picks a winner. Source type is displayed as recorded (never "official").
11. **Prompt injection.** Rules in the system instruction; tool results/retrieved text/goal sit in delimited `<data>` blocks with forgeable tags neutralised; the model sees no tool catalogue beyond `searchRag`; and, decisively, nothing in model output or retrieved text can alter policy, limits, identity or approval because those are computed by server code from server state. Prompt wording is mitigation; the structural controls are the defence.
12. **Failure behaviour.** Model unavailable at the first call → stop, nothing executed. Later model failures/malformed JSON → safe server defaults (full plan, default scoped retrieval, no conflicts, no summary). Executor failure → step failed, run continues or stops with a structured reason. Executor output is shape-validated (and tied to the requested scholarship) before entering state. Hidden and missing scholarships are indistinguishable (`scholarship_not_found`).
13. **Data (migration `20261003000100_application_roadmaps.sql`).** `application_roadmaps` (one per application) and `application_roadmap_steps`; RLS owner-only via `owns_application()` / new `owns_roadmap()`; anon revoked; ownership key not updatable; no admin policy. Tasks reuse `application_tasks`. Creating a task/roadmap finds or creates the student's own `applications` row with status `planning` (RLS allows active scholarships only). This is the minimal storage interface; no workspace UI/status workflow (Module 14) was built. Roadmap-step replacement is not atomic.
14. **Why the model is not trusted with authorization.** It consumes attacker-influenced text (scholarship pages, goals). Anything it decides could therefore be decided by an attacker. Identity, scope, risk, approval and limits are therefore code over server-held state, tested with a hijacked-model simulation and 25 mutation checks.
15. **Known gaps.** No live verification of any kind; `analyzeDocument` returns a structured `analysis_not_supported` (no extraction pipeline exists); no rate limit/cost cap on the route; no run history or audit log; no L3 scheduled monitoring; approval tokens are replayable until expiry; same-origin check trusts `x-forwarded-host`.

## ADR-036 — Matching correctness repair (Repair Session 3; amends ADR-031)

**Context.** A signed-in student's matches were wrong. The data path (identity, profile/education lookup, scholarship + requirement query, field mapping, RLS, rendering) was traced and is correct; the wrong results came from the engine's overall status.

**Decisions.**
1. `MatchResult.decision` (`eligible | not_eligible | needs_information | unknown`) is the student-facing result. `eligible` <=> `status = likely_eligible`; `not_eligible` <=> `status = not_eligible`; otherwise `needs_information` if an unresolved check can be fixed from the profile (`check.missing`), else `unknown`. `status` stays for ranking and for `src/lib/agent/eligibility.ts` (not modified).
2. **Amends ADR-031 rule 2.** The field check is `mandatory` when the scholarship names a field. Unknown (student has no field) or no-word-overlap makes the result unresolved (never `eligible`). It never causes `not_eligible`: free text cannot prove a mismatch. A no-overlap scholarship is still hidden by default as not relevant and revealable with `?show=all`.
3. Unchanged on purpose: degree rules, GPA rules, requirement rows (always unverifiable, so a scholarship with a required written row can be at best `unknown`), `pakistan_side` rows ignored.

**Known limits (not fixed; need schema/product decisions).** Required *document* rows (transcript, CV...) are stored as ordinary requirement rows and therefore keep a scholarship from `eligible`; a `requirement_type` vocabulary or `structured_value` shape is needed. Field matching is word overlap ("Information Technology" vs "Computer Science" share nothing, so it is hidden as not relevant). A same-level record that is still in progress counts as "already holds" (`not_eligible`). `todayIsoDate()` uses the UTC date.

**Status:** LOCKED unless the schema gains structured eligibility data.


## ADR-037 — AI scholarship discovery reuses the Module 08 search (Repair Session 4)

**Problem.** A request like "Find fully funded Master's scholarships in Germany for Computer Science" failed for four separate reasons: (1) `classifyGoal` had no discovery intent, so it was `ambiguous` -> `goal_unsupported` with no model and no search call; (2) the agent's `searchScholarships` adapter was a private `name/provider ILIKE %whole phrase%` query ignoring country/degree/field/funding; (3) several matches -> `scholarship_not_identified` with the candidates discarded, indistinguishable from zero matches; (4) no UI let a student type a request.

**Decision.**
1. One search system. The model returns **criteria data only** (`{"criteria":{keywords,country,degree,field,funding,deadlineDays,openOnly}}`). The reply must be exactly that object: any other key (tool, sql, userId...) or any invalid/hostile value rejects the whole reply -> `invalid_criteria`, no search.
2. The **server** issues the `searchScholarships` tool (never the model; `MODEL_MAY_PROPOSE` stays `["searchRag"]`). Criteria pass the registry validator again (policy layer), then `resolveCriteria` maps them onto the REAL vocabulary from `getFilterOptions`: country by name/slug (an unknown country is never dropped: `no_results`, no search), degree through the Module 09 level parser ("Masters"/"MSc" -> the database's own wordings), field exact else keywords. The existing `getScholarships` runs (anon client, RLS, active only). Both functions are injected, so the adapter has no query of its own.
3. Selection states: exactly one real match (nothing truncated, nothing left out) -> `selected`; several -> `selection_required` with the candidates and the true total; none -> `no_results`; unusable criteria -> `invalid_criteria`. A failing database is `tool_failure`, never "no results". The same logic fixes identification-by-description in the preparation flow (no silent pick).
4. Discovery is read-only: one model call, one search, no profile read, no mutation, no approval.
5. The explanation shown to the student is **built by the server** from the applied criteria and real counts. The model writes no prose about results: free text cannot be grounded against scholarship names (it could mention one that does not exist). A name-grounding validator would be needed before changing this.
6. If Gemini is unavailable the run ends `model_unavailable` (HTTP 503). There is deliberately no keyword fallback for discovery; it would give wrong results silently.

**Limits.** Degree/field wording depends on the database's free text; token search is AND-ed substring matching; more than 5 keyword tokens or 6 degree/field variants are reported as dropped and block auto-selection. Not live-verified (see HANDOFF).

## ADR-038 — The agent reads the student's full stored profile (Repair Session 5; amends ADR-035)
**Problem (reproduced by reading the code).** `getStudentProfile` returned the Module 09 `MatchProfile`: nationality plus education reduced to level/field/CGPA/dates. Experience, institution, degree name, city and name were never read, and `stateDigest` (everything the model sees) contained **no student data at all**, so the agent could not answer "what degree / field / CGPA / experience / what is missing" and could only avoid inventing facts by not knowing any.
**Decision.**
1. The tool returns an `AgentProfile` built by the pure `toAgentProfile` from the three tables that hold profile data (`profiles`: full_name, nationality, city; `education`: all columns the student can edit; `experiences`: all editable columns). Nothing is inferred; an unusable value is `null` ("not recorded"). No row id, user id, role or `date_of_birth` (not collected, ADR for Module 03). Documents stay in their own tool (metadata only; content extraction is out of scope).
2. Identity is the session: `ctx.userId`. The tool takes no parameters; the policy layer already drops anything the model sends, the executor ignores `_input`, and the model cannot propose this tool at all (only `searchRag`). The loader keeps explicit `user_id` / own-`profile_id` filters because RLS alone is not enough for an admin session (`profiles_select_admin`).
3. `loadOwnProfileResult` separates **no profile row** (`missing` -> tool ok, `recordExists:false`) from **a failed query** (`error` -> `unavailable`). A failure is never shown as an empty profile. `loadOwnProfile` keeps its old contract for the profile page and matching.
4. Bounded and sanitised: <=10 education, <=20 experiences (the omission is reported, never silent); strings single-line, control characters removed, length-capped; numbers must be finite and CGPA <= scale; dates must be real ISO dates; non-array/odd rows are skipped and counted.
5. The model sees a server-built profile section in `stateDigest` with its own character budget (never pushed out by a long scholarship record). The **full name is not sent** (not needed to plan); whether it exists is. Student-typed text is untrusted data like any other (single-line + `neutralize`).
6. `checkEligibility` is unchanged (still Module 09 `loadMatchProfile`). Tasks/roadmap content is unchanged: profile gaps are available to the model and tests, but no new tasks are created from them.
**Limits.** "Currently studying" is not stored; the agent has dates and the student's own `level`, nothing more. `missing` lists only fields the schema can hold.

## ADR-037 — Application Workspace (Module 14)

**Decision:** Student application workspace uses existing tables only (`applications`, `application_tasks`, `application_roadmaps` / steps). No new migration.

1. **Routes:** `/applications` (list) and `/applications/[id]` (detail) — protected, own rows only (`user_id` from session + RLS).
2. **Status vocabulary (app-enforced):** applications `planning|in_progress|submitted|withdrawn|accepted|rejected`; tasks `todo|in_progress|done|skipped` (aligned with Module 13). No DDL CHECK added (same pattern as free-text `document_type`).
3. **Mutations:** Server Actions only; identity from `auth.getUser()`; never read `user_id` from the client; cookie-bound Supabase client (no service role). Starting an application inserts `{user_id, scholarship_id, status:'planning'}` only if none exists for that pair (else redirects to existing).
4. **Timestamps:** `started_at` / `submitted_at` set server-side on status transitions, not from client clocks.
5. **Documents:** Module 06 vault remains the document store; this module does not invent `application_documents`.
6. **Submit:** UI never submits to official portals; copy states ScholarPath does not apply on the student's behalf.
7. **Agent coexistence:** Tasks/roadmaps created by Module 13 appear in the workspace; students can add tasks and update status independently.

**Status:** Implemented; unit/static verified in authoring session. Live Supabase/browser **not** verified here.

## ADR-039 — Application drafts (Module 15)

**Decision:** Store AI/manual application drafts in `application_drafts` owned via `applications` + `owns_application()` RLS. Generation uses Gemini text (not JSON) with a strict no-invention system prompt and profile+scholarship context only. Clients never see API keys; drafts require explicit student save and optional "reviewed" flag.

**Consequences:** New migration required before use. Live Gemini still blocked in sandbox. Module 16 will read these drafts for consistency checks.

## ADR-040 — Application review is deterministic and computed on demand (Module 16)

**Problem.** FR-022 (consistency) and FR-023 (final application check) need eligibility, document completeness, writing readiness, task/deadline status, and contradiction heuristics without inventing student facts or auto-submitting applications.

**Decision.**
1. **No new table.** Health is computed per request from existing owned data (profile, documents metadata, application tasks, drafts, scholarship deadline) plus Module 09 `evaluateScholarship`. Nothing is persisted as a “review score”.
2. **Pure engine** in `src/lib/review/` (`completeness`, `consistency`, `deadline`, `eligibility-items`, `health`). No AI in the review path; GPA/field/experience heuristics only flag possible mismatches for the student to verify.
3. **Server load** in `service.server.ts` uses the cookie-bound client for own rows and the public anon client only to re-read the active scholarship for eligibility. No service role.
4. **UI** `ReviewPanel` on `/applications/[id]` shows overall status (`ready` / `needs_work` / `not_ready`), score, and grouped findings. Copy states ScholarPath does not submit applications.
5. **Out of scope:** document content OCR/analysis, `application_documents` linking, automatic official-portal submit, storing review snapshots.

**Status:** Implemented; unit + static verified in authoring session. Live Supabase/browser **not** verified here.


## ADR-041 — Mentor community content is personal experience only (Module 17)

**Problem.** FR-025/FR-026 need mentor applications, admin verification, stories, timelines, and Q&A without presenting mentor content as official requirements or letting users self-grant mentor/admin roles.

**Decision.**
1. **Tables:** `mentor_stories`, `mentor_timelines`, `mentor_questions`, `mentor_answers` with RLS. Helpers `owns_mentor()` and `is_verified_mentor()`.
2. **Verification:** Students insert a `mentors` row (`pending`). Admins update `verification_status` / `verified_at` via session client (`is_admin()` policy + column grants). Clients cannot self-verify. Elevating `profiles.role` to `mentor` remains `set_user_role()` (service_role only); dashboard access is gated on **verified mentor row**, not role alone.
3. **Content:** Only verified mentors insert/publish stories, timelines, answers. Public reads published stories and verified timelines. UI always labels content as personal experience.
4. **Q&A:** Authenticated students post questions; verified mentors publish answers. Questions are readable publicly for community learning.
5. **Routes:** `/mentors`, `/mentors/[id]` public; `/mentor/apply`, `/mentor/dashboard` protected; `/admin/mentors` admin-only.

**Status:** Implemented; unit/static verified. Live Supabase/browser **not** verified here.


## ADR-042 — Admin dashboard and reports (Module 18)

**Problem.** FR-027 needs an admin surface for scholarships, sources, RAG visibility, mentors, users, reports, and audit without exposing secrets or allowing self-grant of admin.

**Decision.**
1. **Reports table** with RLS: reporters insert/read own rows; admins read/update all. Status transitions logged to `admin_actions`.
2. **Admin UI** under `/admin/*` always uses `requireRole(["admin"])` and the cookie-bound client (RLS `is_admin()`). No service-role client in app code. Role elevation remains `set_user_role` (service_role only).
3. **Dashboard stats** are head counts only; failures degrade to zero.
4. **Security headers** (frame options, nosniff, referrer, permissions-policy) applied globally via `next.config.ts`.
5. **Health** endpoint reports boolean config presence only, never key values.
6. Out of scope for this module: full source editor UI (still on scholarship admin), automated malware scanning, multi-region deploy scripts.

**Status:** Implemented; unit/static verified. Live Supabase **not** verified here.
