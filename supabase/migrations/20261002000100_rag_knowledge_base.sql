-- Module 11 — RAG Knowledge Base (ADR-033).
-- New tables: knowledge_documents, knowledge_chunks (+ pgvector). Earlier migrations are untouched.
--
-- Access model (deliberately closed):
--   * anon / authenticated have NO direct access, except an admin-only SELECT (is_admin()).
--   * Writes happen only through the server-side ingestion code using the service role (ADR-033 §6).
--   * Retrieval goes through public.match_knowledge_chunks(), executable by service_role ONLY. The
--     function itself enforces "active scholarship + active, verified source + ready document", so
--     draft/archived/unverified material can never be returned even though the service role bypasses RLS.
--   * Chunks contain only text fetched from public scholarship-source URLs. No student data is stored here.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- Embedding dimension is fixed at 768 (gemini-embedding-001 with outputDimensionality=768, ADR-033 §4).
-- Changing model or dimension requires a NEW migration (new column/table + re-embedding), never an edit.

create table public.knowledge_documents (
  id                   uuid primary key default gen_random_uuid(),
  source_id            uuid not null unique references public.scholarship_sources (id) on delete cascade,
  scholarship_id       uuid references public.scholarships (id) on delete cascade,
  topic_type           text not null default 'scholarship' constraint knowledge_documents_topic_type_check
                         check (topic_type in ('scholarship')),
  title                text constraint knowledge_documents_title_len check (title is null or char_length(title) <= 500),
  -- Snapshots of the source as it was at ingestion time. Never upgraded; retrieval re-joins the live source row.
  source_url           text not null constraint knowledge_documents_url_http check (source_url ~* '^https?://'),
  source_type          text,
  source_priority      integer not null default 0,
  last_verified_at     timestamptz,
  version              integer not null default 1 constraint knowledge_documents_version_check check (version >= 1),
  content_hash         text,
  processing_status    text not null default 'pending' constraint knowledge_documents_status_check
                         check (processing_status in ('pending', 'processing', 'ready', 'failed')),
  -- Short machine code only (e.g. 'blocked_url', 'unsupported_content_type'). Never raw errors, URLs, keys or content.
  error_code           text constraint knowledge_documents_error_code_check
                         check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  chunk_count          integer not null default 0 constraint knowledge_documents_chunk_count_check check (chunk_count >= 0),
  embedding_model      text,
  embedding_dimensions smallint,
  chunking_version     text,
  last_attempt_at      timestamptz,
  ingested_at          timestamptz,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint knowledge_documents_ready_consistent check (
    processing_status <> 'ready' or (ingested_at is not null and error_code is null and chunk_count > 0)
  ),
  constraint knowledge_documents_failed_has_code check (processing_status <> 'failed' or error_code is not null)
);
create index knowledge_documents_scholarship_idx on public.knowledge_documents (scholarship_id);
create index knowledge_documents_status_idx on public.knowledge_documents (processing_status);
create trigger knowledge_documents_set_updated_at before update on public.knowledge_documents
  for each row execute function public.set_updated_at();

create table public.knowledge_chunks (
  id                     uuid primary key default gen_random_uuid(),
  knowledge_document_id  uuid not null references public.knowledge_documents (id) on delete cascade,
  chunk_index            integer not null constraint knowledge_chunks_index_check check (chunk_index >= 0),
  content                text not null constraint knowledge_chunks_content_len check (char_length(content) between 1 and 8000),
  embedding              extensions.vector(768) not null,
  page_number            integer constraint knowledge_chunks_page_check check (page_number is null or page_number > 0),
  section                text constraint knowledge_chunks_section_len check (section is null or char_length(section) <= 300),
  metadata               jsonb not null default '{}'::jsonb,
  content_hash           text not null,
  created_at             timestamptz not null default now(),
  constraint knowledge_chunks_doc_index_unique unique (knowledge_document_id, chunk_index)
);
-- Cosine distance (<=>) matches how embeddings are compared in match_knowledge_chunks().
create index knowledge_chunks_embedding_idx on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- RLS + grants (Supabase auto-grants ALL on new public tables; revoke, then grant explicitly)
-- ---------------------------------------------------------------------------
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks    enable row level security;

revoke all on table public.knowledge_documents, public.knowledge_chunks from public, anon, authenticated;

-- Admin read-only visibility (processing status/errors are private ingestion metadata). No client writes.
grant select on public.knowledge_documents, public.knowledge_chunks to authenticated;
create policy knowledge_documents_select_admin on public.knowledge_documents for select to authenticated
  using (public.is_admin());
create policy knowledge_chunks_select_admin on public.knowledge_chunks for select to authenticated
  using (public.is_admin());

-- Server-side ingestion (service role) — explicit, minimal.
grant select, insert, update, delete on public.knowledge_documents, public.knowledge_chunks to service_role;

-- ---------------------------------------------------------------------------
-- Retrieval. SECURITY INVOKER (no privilege escalation); service_role only.
-- similarity = 1 - cosine distance. It is a raw geometric measure, NOT a probability.
-- No threshold is applied by default (min_similarity null): a cut-off needs the benchmark in RAG.md.
-- ---------------------------------------------------------------------------
create or replace function public.match_knowledge_chunks(
  query_embedding        extensions.vector(768),
  match_count            integer default 8,
  min_similarity         double precision default null,
  filter_scholarship_id  uuid default null
)
returns table (
  chunk_id               uuid,
  knowledge_document_id  uuid,
  scholarship_id         uuid,
  source_id              uuid,
  source_url             text,
  source_name            text,
  source_type            text,
  source_priority        integer,
  source_last_verified_at timestamptz,
  document_title         text,
  section                text,
  page_number            integer,
  chunk_index            integer,
  content                text,
  similarity             double precision
)
language sql stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id, d.id, d.scholarship_id, s.id, s.source_url, s.source_name, s.source_type, s.priority,
    s.last_verified_at, d.title, c.section, c.page_number, c.chunk_index, c.content,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.knowledge_document_id
  join public.scholarship_sources s on s.id = d.source_id
  join public.scholarships sc on sc.id = s.scholarship_id
  where d.active
    and d.processing_status = 'ready'
    and s.active
    and s.last_verified_at is not null
    and sc.status = 'active'
    and (filter_scholarship_id is null or sc.id = filter_scholarship_id)
    and (min_similarity is null or (1 - (c.embedding <=> query_embedding)) >= min_similarity)
  order by c.embedding <=> query_embedding, c.id
  limit greatest(1, least(coalesce(match_count, 8), 20));
$$;

revoke all on function public.match_knowledge_chunks(extensions.vector, integer, double precision, uuid) from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer, double precision, uuid) to service_role;
