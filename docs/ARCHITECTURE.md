# ScholarPath PK — Architecture

## 1. High-Level Architecture

```text
                         USER
                           |
                           v
                    NEXT.JS WEB APP
                           |
             +-------------+-------------+
             |                           |
          Supabase                   AI Gateway
             |                           |
     +-------+--------+          +-------+-------+
     |       |        |          |               |
    Auth    DB     Storage     Gemini           Grok
             |                 Primary         Fallback
          pgvector
             |
            RAG
```

## 2. Frontend

Next.js + TypeScript.

Responsibilities:
- routing
- UI
- forms
- dashboards
- public pages
- authenticated views
- scholarship browsing
- application workspace
- mentor pages
- admin UI

Do not put provider API keys in browser code.

## 3. Supabase

Supabase is the backend platform.

Use:
- Auth for identity
- PostgreSQL for structured data
- Storage for private documents
- pgvector for RAG embeddings
- Edge Functions for secure server-side operations

## 4. Database Philosophy

Use structured columns for fields that must be filtered or matched.
Use text/chunk/vector data for RAG knowledge.
Do not store scholarship data inside frontend source code.

## 5. AI Gateway

All AI calls go through a common provider abstraction.

```text
AIService
  |
  +-- GeminiProvider
  +-- GrokProvider
  +-- FutureProvider
```

The rest of the application should call `AIService`, not Gemini/Grok directly.

## 6. Agent Orchestrator

The agent sits above tools and models.

```text
User Goal
   |
   v
Agent Orchestrator
   |
   +-- profile tool
   +-- document tool
   +-- scholarship search tool
   +-- eligibility tool
   +-- RAG search tool
   +-- roadmap/task tool
   +-- writing tool
   +-- review tool
   |
   v
AI Provider
   |
   v
Human approval when required
```

The agent should not be allowed to directly write arbitrary database values. Tools should expose narrow, validated operations.

## 7. RAG Architecture

```text
Official Source
   |
   v
Extractor
   |
   v
Cleaner
   |
   v
Chunker
   |
   v
Embedding Generator
   |
   v
Supabase pgvector
   |
   v
Retriever
   |
   v
Gemini/Grok
   |
   v
Answer + Evidence
```

## 8. Matching Architecture

```text
Student Profile
      |
      v
SQL/Rule Filtering
      |
      v
Candidate Scholarships
      |
      v
Profile Match Scoring
      |
      v
Top Opportunities
      |
      v
AI Explanation (optional)
```

No LLM call should be needed for simple filters.

## 9. Application Architecture

```text
Scholarship
   |
   v
Requirements
   |
   +--> Checklist
   +--> Eligibility
   +--> Roadmap
   +--> Application
               |
               +--> Documents
               +--> SOP/Essay
               +--> Questions
               +--> Review
```

## 10. Security Architecture

- RLS on user-owned records
- storage policies on private documents
- admin role checked server-side
- mentor verification cannot be self-granted
- AI keys stored only in server-side environment variables
- all high-risk operations protected by explicit confirmation

## 11. Deployment

Initial:
- GitHub repository
- Vercel for Next.js
- Supabase hosted project

The system should remain portable enough to upgrade Supabase/Vercel later.
