-- Users that exist BEFORE the migrations run (Module 02 era) to exercise the backfill.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1', 'pre-admin@example.test',   '{"role":"admin"}',    '{}'),
 ('00000000-0000-0000-0000-0000000000a2', 'pre-mentor@example.test',  '{"role":"mentor"}',   '{}'),
 ('00000000-0000-0000-0000-0000000000a3', 'pre-plain@example.test',   '{}',                  '{}'),
 ('00000000-0000-0000-0000-0000000000a4', 'pre-junk@example.test',    '{"role":"superuser"}','{}'),
 ('00000000-0000-0000-0000-0000000000a5', 'pre-usermeta@example.test','{}',                  '{"role":"admin"}');
