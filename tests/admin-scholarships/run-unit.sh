#!/bin/bash
# Compiles the pure Module 07 modules and runs unit tests. No DB, no network.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/admin-scholarships/validation.ts src/lib/admin-scholarships/import.ts src/lib/admin-scholarships/readiness.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict || exit 1
node "$HERE/validation.test.cjs" "$OUT"; RC=$?; node "$HERE/pipeline.test.cjs" "$OUT" || RC=1
rm -rf "$OUT"; exit $RC
