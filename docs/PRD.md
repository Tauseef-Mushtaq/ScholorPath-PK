# ScholarPath PK — Product Requirements Document

**Version:** 2.0 — Agentic Edition
**Target:** Pakistani students seeking international education opportunities
**Initial deployment:** Vercel + Supabase free tiers

## 1. Product Vision

ScholarPath PK is a free-first digital companion that helps Pakistani students move through the complete international scholarship journey: discovering suitable opportunities, understanding official requirements, preparing documents, completing application materials, tracking progress, and learning from successful scholars.

## 2. Problem

Scholarship information and application processes are fragmented across scholarship providers, universities, HEC, government services, PDFs, portals and other websites. Students must manually research eligibility, funding, IELTS requirements, documents, dates, Pakistan-side procedures and application steps. They also need help creating SOPs, essays, research proposals and answers to application questions.

## 3. Solution

ScholarPath combines:

- Scholarship database and discovery
- Personalized profile and document vault
- Eligibility and profile matching
- Official-source RAG assistant
- Agentic scholarship/application assistant
- SOP/essay/research proposal support
- Application roadmap and deadline tracking
- Final consistency/application review
- Pakistan-specific process guidance
- Verified scholar mentor community
- Admin-controlled information verification

## 4. Product Promise

**Create your profile once. Find suitable opportunities. Understand what you need. Prepare your application. Track everything in one place.**

## 5. Funding Categories

Every opportunity must be classified as:

- Fully Funded
- Partially Funded
- Not Funded / Admission Only

Funding components should be stored separately: tuition, stipend, accommodation, insurance, travel and other benefits.

## 6. Degree Categories

- BS / Bachelor's
- Master's
- MPhil
- PhD
- Research

## 7. User Roles

### Guest
Can view public landing page, countries, public scholarships and public mentor stories.

### Student
Can manage personal profile, private documents, matching, RAG questions, roadmaps, applications and AI writing support.

### Mentor
A student account with mentor privileges. Can apply for verification, publish scholarship journeys, share experience and answer questions.

### Admin
Manages scholarship data, countries, universities, official sources, RAG knowledge, mentors, moderation, users and system settings.

## 8. Core Functional Requirements

### FR-001 Authentication
Signup, login, logout, password reset and session handling using Supabase Auth.

### FR-002 Student Profile
Personal, education, academic, research, experience, English tests, projects, publications, awards, goals, preferred countries, preferred degrees and funding preference.

### FR-003 Document Vault
Private upload, categorization, preview, rename, delete and processing status. Initial documents include CV, transcript, degree, certificates, experience letters and research papers.

### FR-004 AI Document Understanding
AI can extract structured information from uploaded CVs/transcripts. Extracted values must be shown to the student for confirmation before becoming trusted profile data.

### FR-005 Scholarship Database
Scholarship records contain country, provider, degree, field, funding, eligibility, GPA, age, English requirements, documents, opening date, deadline, application fee, official information URL, official application URL, source metadata and verification date.

### FR-006 Country Browsing
Scholarships are browsable by country and then by funding and degree.

### FR-007 Search and Filters
Search by country, degree, field, funding, IELTS, GPA, deadline, university and application fee.

### FR-008 Eligibility Engine
Use deterministic rules for hard eligibility where possible: nationality, degree, field, GPA, age, deadline and published test requirements.

### FR-009 Personalized Matching
Compare the student's profile with scholarship requirements and return Strong Match, Possible Match or Not Eligible, with reasons.

### FR-010 Scholarship Details
Show overview, funding, eligibility, documents, English, dates, application process, Pakistan-side requirements, roadmap, official links, RAG assistant and mentor experiences.

### FR-011 Source Verification
Every active scholarship must have an official source and official application URL where applicable, plus a last verified date.

### FR-012 RAG Knowledge Base
Official pages and PDFs are ingested, cleaned, chunked, embedded and stored in pgvector with metadata.

### FR-013 RAG Q&A
Student questions are answered using retrieved evidence. Answers should provide source information. If evidence is insufficient, the system must say so.

### FR-014 Agentic Assistant
Student can give a goal such as “Prepare me for this scholarship.” The agent reads the profile, retrieves official information, checks documents, identifies missing tasks, creates/updates a roadmap and prepares drafts. It must ask for approval for consequential actions.

### FR-015 Roadmap
Create scholarship-specific tasks based on requirements, profile state and deadline.

### FR-016 Document Checklist
Compare required documents against uploaded documents.

### FR-017 Application Workspace
Track application status, tasks, documents, notes, timeline, deadlines and official portal.

### FR-018 SOP/Essay Assistant
Help with SOP, motivation letter, personal statement, study plan and scholarship essays without inventing facts.

### FR-019 Research Proposal Assistant
Help structure and draft research proposals for research degrees. Claims and references must be verified by the student.

### FR-020 Application Question Assistant
Suggest answers using the student's profile, documents, programme information and official requirements. User must review.

### FR-021 CV Assistant
Review and tailor CV content without inventing experience or achievements.

### FR-022 Consistency Checker
Compare profile, CV, transcript, SOP, research proposal and application answers for contradictions or items needing verification.

### FR-023 Final Application Check
Show eligibility, document completeness, writing readiness, application-answer issues, inconsistencies and deadline status.

### FR-024 Pakistan Guidance
Provide verified, source-linked guidance for HEC, IBCC, MoFA, university document processes and other relevant steps. Requirements are opportunity-specific.

### FR-025 Mentor Program
Student can apply to become a mentor. Admin can verify scholarship claims. Verified mentors can create journeys, stories, timelines, interview experiences and tips.

### FR-026 Mentor Q&A
Students can ask mentors questions. Mentor content must be labeled as personal experience, not official requirements.

### FR-027 Admin
Manage scholarships, sources, countries, universities, RAG content, mentors, reports, users, verification and audit logs.

### FR-028 AI Provider Fallback
Gemini is primary. Grok is optional fallback. Core product must remain usable if AI is unavailable.

## 9. Agent Capabilities

The Scholarship Agent should be able to:

- Read student profile
- Read permitted documents
- Search scholarships
- Retrieve official scholarship evidence
- Check eligibility
- Analyze missing requirements
- Create/update tasks
- Build/update roadmap
- Draft SOP/essay/research proposal/application answers
- Check consistency
- Create reminders
- Prepare a final application checklist

### Agent autonomy levels

**Automatic:** search, retrieve, organize, calculate, create low-risk drafts and tasks.

**Approval required:** sending messages, sharing documents, changing high-impact profile values, final application answers and any submission-related action.

**Never automatic:** submitting official applications or inventing information.

## 10. Non-Functional Requirements

### Performance
- Fast public pages
- Search/filter should not call an LLM
- Target under ~3 seconds for normal page loads where practical
- AI operations must show progress states

### Security
- Supabase Auth
- Row Level Security
- private document storage
- secure server-side AI calls
- no AI keys in browser
- role-based access
- rate limiting
- input validation
- file-size/type validation
- audit logs

### Privacy
- student documents are private
- collect only necessary data
- allow document/account deletion
- explain AI data usage
- do not expose private documents through public URLs

### Reliability
Core browsing, filtering, profile, document management and application tracking should continue to work if AI providers are unavailable.

## 11. RAG Trust Rules

1. Official provider/university/government sources are highest priority.
2. Scholarship facts must be grounded in source evidence where possible.
3. Every source has metadata and a last-verified date.
4. The AI must not invent deadlines, eligibility, funding or URLs.
5. If the system lacks evidence, it says so.
6. Official information and mentor experience are visually separated.

## 12. Success Metrics

### Primary metric
Completed scholarship applications assisted.

### Adoption
- Profile completion rate
- Scholarship discovery rate
- Scholarship saves
- Roadmap starts
- AI feature usage

### Application
- Applications started
- Applications submitted
- Task completion rate
- Application abandonment

### Quality
- Critical scholarship field accuracy target: 99%+ after verification
- RAG source-supported factual answers target: 95%+ on benchmark
- Low unsupported-answer/hallucination rate

### Community
- Verified mentors
- Mentor stories
- Questions answered
- Students helped

## 13. Scope

### In Scope for MVP
- landing page
- auth
- student profile
- document vault
- curated scholarship database
- country/degree/funding browsing
- eligibility/matching
- scholarship details
- official sources
- RAG
- agentic assistant
- roadmap
- application tracker
- SOP/essay/basic research proposal assistance
- consistency/final review
- mentor stories
- admin dashboard

### Out of Scope for MVP
- automatic application submission
- universal browser autofill
- native mobile apps
- complete visa-management system
- automatic worldwide scraping
- custom LLM training
- guaranteed acceptance probability
- automated recommendation-letter impersonation
- payment/subscription system
- full social network

## 14. Free-First Constraint

Initial target is $0 software cost using free tiers. The architecture must allow later upgrades without redesign.
