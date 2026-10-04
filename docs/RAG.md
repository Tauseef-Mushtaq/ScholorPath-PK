# ScholarPath PK — RAG Specification

## Objective

Answer scholarship and application questions using verified source material rather than relying only on model memory.

## Source Priority

1. Official scholarship provider
2. Official university/programme
3. Government/HEC official source where relevant
4. Official partner organization
5. Trusted secondary source

Lower-priority sources must not override higher-priority official information without explicit admin review.

## Ingestion

```text
Source URL / PDF
   ↓
Fetch or upload
   ↓
Extract text
   ↓
Clean
   ↓
Chunk
   ↓
Embed
   ↓
Store in pgvector
   ↓
Attach source metadata
```

## Chunk Metadata

Each chunk should retain:

- scholarship_id or topic_id
- source URL
- source title
- source type
- page number where applicable
- section
- last verified date
- version/hash where useful

## Retrieval

Given a question:

```text
User Question
 ↓
Identify context/scholarship
 ↓
Semantic retrieval
 ↓
Optional keyword/structured filtering
 ↓
Top relevant chunks
 ↓
Gemini/Grok
 ↓
Answer + source references
```

## Answer Rules

- Prefer concise answers.
- Cite or link the supporting source.
- State uncertainty when evidence is incomplete.
- Do not invent requirements.
- Do not treat mentor stories as official requirements.
- If official sources conflict, surface the conflict and prefer the most current official source after verification.

## RAG Evaluation

Create a benchmark of scholarship questions with known answers.

Measure:

- answer correctness
- source correctness
- citation coverage
- unsupported answer rate
- retrieval relevance
