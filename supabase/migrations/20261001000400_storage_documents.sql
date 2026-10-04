-- Module 03 / 4 of 4 — Private storage bucket for student documents (docs/SECURITY.md "Documents").
--
-- * Bucket is PRIVATE (public = false): no permanent public URLs; access via signed URLs / owner policies.
-- * 10 MB limit and MIME allow-list are enforced by Supabase Storage at upload (and mirrored by the
--   CHECK constraints on public.documents).
-- * Object path convention: <auth.uid()>/<file>. Owner-only policies; admins get NO policy here —
--   any admin access must be an explicit server-side (service role) operation.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy documents_objects_select_own on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy documents_objects_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy documents_objects_update_own on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy documents_objects_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
