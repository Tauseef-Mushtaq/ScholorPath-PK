#!/bin/bash
# Applies supabase/migrations to a throwaway LOCAL Postgres database (with a Supabase shim) and
# runs the RLS/security tests. This is NOT live Supabase. Usage: npm run test:db
# Needs a local Postgres server and a role allowed to create databases (default: `postgres` user via
# `su postgres`, or set PGHOST/PGUSER/PGPASSWORD).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
DB="scholarpath_rls_test"
if [ -n "${PGHOST:-}" ] || [ -n "${PGUSER:-}" ]; then P() { psql -X -v ON_ERROR_STOP=1 -q "$@"; }
else P() { su postgres -c "psql -X -v ON_ERROR_STOP=1 -q $(printf '%q ' "$@")"; }; fi
cp_for_postgres() { mkdir -p /tmp/spdb && cp -r "$ROOT/supabase/migrations" "$HERE"/*.sql /tmp/spdb/ && chmod -R a+rX /tmp/spdb; }
cp_for_postgres
P -d postgres -c "drop database if exists $DB" -c "create database $DB" || exit 1
# Module 11 needs pgvector (migration 20261002000100). Fail early with a clear message instead of a cryptic error.
if [ "$(P -d "$DB" -At -c "select count(*) from pg_available_extensions where name = 'vector'" | tr -d '[:space:]')" != "1" ]; then
  echo "pgvector is not installed in this Postgres (needed by Module 11). Install it (e.g. postgresql-16-pgvector) and re-run." >&2; exit 1
fi
P -d "$DB" -f /tmp/spdb/shim.sql || exit 1
P -d "$DB" -f /tmp/spdb/seed-pre.sql || exit 1
for f in /tmp/spdb/migrations/*.sql; do echo "applying $(basename "$f")"; P -d "$DB" -f "$f" || { echo "MIGRATION FAILED: $f"; exit 1; }; done
echo "== running rls.test.sql =="
su postgres -c "psql -X -q -d $DB -f /tmp/spdb/rls.test.sql" 2>&1 | grep -vE '^(SET|BEGIN|ROLLBACK|CREATE|GRANT|INSERT|DO)' | tee /tmp/rls-test.out
grep -q "FAILED: 0" /tmp/rls-test.out && ! grep -q "^FAIL" /tmp/rls-test.out
