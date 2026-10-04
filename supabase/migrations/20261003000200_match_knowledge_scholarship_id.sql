-- Repair Session 7: match_knowledge_chunks must return the scholarship id used for the scope filter.
--
-- Bug: the function filtered by scholarship_sources.scholarship_id (via join to scholarships sc)
-- but selected knowledge_documents.scholarship_id, which is nullable. When that column was null
-- (or drifted), Module 12/13 defence-in-depth filters (`chunk.scholarshipId === requestedId`)
-- dropped every row → empty evidence even though SQL found the right chunks.
--
-- Fix: return sc.id (the same id the WHERE clause uses). No change to access model, grants, or
-- similarity semantics. Earlier migrations are untouched.

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
    c.id,
    d.id,
    sc.id,                         -- always the filtered scholarship (never a nullable document snapshot)
    s.id,
    s.source_url,
    s.source_name,
    s.source_type,
    s.priority,
    s.last_verified_at,
    d.title,
    c.section,
    c.page_number,
    c.chunk_index,
    c.content,
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

-- Re-assert grants (create or replace keeps them, but pin explicitly).
revoke all on function public.match_knowledge_chunks(extensions.vector, integer, double precision, uuid) from public, anon, authenticated;
grant execute on function public.match_knowledge_chunks(extensions.vector, integer, double precision, uuid) to service_role;
