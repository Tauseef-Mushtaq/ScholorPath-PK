#!/bin/bash
# Compiles the PURE Module 09 matching engine (no I/O, no Supabase, no AI) and runs the unit tests.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" || exit 1
FILES="src/lib/matching/types.ts src/lib/matching/normalize.ts src/lib/matching/eligibility.ts src/lib/matching/explain.ts src/lib/matching/profile-gaps.ts src/lib/matching/rank.ts src/lib/matching/params.ts src/lib/matching/index.ts"
FLAGS="--outDir $OUT --module commonjs --target es2020 --skipLibCheck --strict"
# TypeScript 6 refuses files on the command line next to a tsconfig.json unless --ignoreConfig is given; TypeScript 5 does not know the flag.
npx tsc $FILES $FLAGS >/dev/null 2>&1 || npx tsc $FILES $FLAGS --ignoreConfig || exit 1
node "$HERE/matching.test.cjs" "$OUT"; RC=$?
# Repair Session 3: realistic Student A-D scenarios + the "missing information is never eligible" invariant (pure engine).
node "$HERE/scenarios.test.cjs" "$OUT" || RC=1
rm -rf "$OUT"; exit $RC
