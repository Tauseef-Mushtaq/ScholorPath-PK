#!/bin/bash
# Compiles the pure Module 10 detail-page logic (no I/O, no Supabase, no AI) and runs the unit tests.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/public/detail.ts src/lib/public/format.ts src/lib/public/types.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict || exit 1
node "$HERE/detail.test.cjs" "$OUT"; RC=$?
rm -rf "$OUT"; exit $RC
