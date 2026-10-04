#!/bin/bash
# Repair Session 3: compiles the matching engine + the two real query modules and runs tests/matching/flow.test.cjs
# against an in-memory Supabase stand-in (columns validated against the real migrations; RLS re-implemented by hand).
# NOT live Supabase, NOT real PostgREST, NOT real Postgres RLS.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" || exit 1
FILES="src/lib/matching/index.ts src/lib/matching/queries.ts src/lib/profile/queries.ts"
# queries.ts imports Next/Supabase aliases that are shimmed at test time, so type errors from unresolved aliases are ignored (--noCheck);
# the strict type check of these files is `npm run typecheck`.
FLAGS="--outDir $OUT --rootDir src --module commonjs --target es2020 --skipLibCheck --noCheck --esModuleInterop"
npx tsc $FILES $FLAGS >/dev/null 2>&1 || npx tsc $FILES $FLAGS --ignoreConfig || exit 1
node "$HERE/flow.test.cjs" "$OUT"; RC=$?
rm -rf "$OUT"; exit $RC
