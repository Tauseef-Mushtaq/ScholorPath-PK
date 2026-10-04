#!/bin/bash
# Compiles the PURE Module 13 modules (+ the Module 09 engine used by the eligibility mapping) and runs the unit tests.
# Unit + MOCK tests only: NOT live Gemini and NOT live Supabase verification.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/agent/index.ts src/lib/matching/index.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict --types node ${TSC_EXTRA:-} || exit 1
node "$HERE/agent.test.cjs" "$OUT"; RC=$?
node "$HERE/discovery.test.cjs" "$OUT" || RC=1
# Repair Session 6: pure document-requirement coverage (metadata only; no content extraction).
node "$HERE/documents.test.cjs" "$OUT" || RC=1
# Repair Session 5: the REAL profile tool (executors.server.ts + profile/queries.ts) against an in-memory Supabase stand-in (not live).
OUT2="$(mktemp -d)"
FLAGS2="--outDir $OUT2 --rootDir src --module commonjs --target es2020 --skipLibCheck --noCheck --esModuleInterop ${TSC_EXTRA:-}"
npx tsc src/lib/agent/index.ts src/lib/agent/executors.server.ts src/lib/profile/queries.ts $FLAGS2 >/dev/null 2>&1 || npx tsc src/lib/agent/index.ts src/lib/agent/executors.server.ts src/lib/profile/queries.ts $FLAGS2 --ignoreConfig || RC=1
node "$HERE/profile.test.cjs" "$OUT2" || RC=1
rm -rf "$OUT" "$OUT2"; exit $RC
