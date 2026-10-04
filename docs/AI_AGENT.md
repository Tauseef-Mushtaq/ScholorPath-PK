# ScholarPath PK — Agentic AI Specification

## Purpose

The Scholarship Agent turns a student's goal into a sequence of useful actions rather than only answering isolated questions.

## Example Goal

> “Prepare me for this fully funded Master's scholarship in Germany.”

The agent may:

1. Read the student's profile.
2. Read permitted documents.
3. Load the scholarship record.
4. Retrieve official requirements using RAG.
5. Check eligibility.
6. Compare requirements with the document vault.
7. Identify missing items.
8. Create a roadmap.
9. Draft an SOP outline.
10. Create application tasks.
11. Check the deadline.
12. Return a summary and ask for approval where needed.

## Tool Design

Tools must be narrow and validated.

Suggested tools:

- `getStudentProfile` (the signed-in student's stored profile, education and experience; no parameters, identity from the session)
- `getStudentDocuments`
- `searchScholarships`
- `getScholarship`
- `checkEligibility`
- `searchRag`
- `createTask`
- `updateTask`
- `createRoadmap`
- `updateRoadmap`
- `analyzeDocument`
- `draftSop`
- `draftEssay`
- `draftResearchProposal`
- `draftApplicationAnswer`
- `checkApplication`
- `createReminder`

## Agent Rules

### The agent may automatically:

- search public/authorized data
- retrieve RAG evidence
- calculate dates
- organize information
- create low-risk drafts
- create low-risk tasks
- update progress based on confirmed facts

### The agent requires approval for:

- sending a message/email
- sharing a private document
- changing high-impact student data
- approving final application text
- any action that represents the user externally

### The agent must never:

- submit an official application automatically
- fabricate experience or achievements
- invent scholarship rules
- claim guaranteed acceptance
- make up citations or sources
- expose another user's data

## Agent Memory

Long-term state is stored in the database through structured entities such as profile, documents, applications, tasks and approved drafts. Do not use the LLM conversation context as the only source of truth.
