#!/bin/bash
# Module 14 pure validation unit tests.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/applications/validation.ts src/lib/applications/constants.ts src/lib/applications/format.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict ${TSC_EXTRA:-} || exit 1
# flatten if nested
if [ -d "$OUT/applications" ]; then DIR="$OUT/applications"; else DIR="$OUT"; fi
node "$HERE/validation.test.cjs" "$DIR"; RC=$?
rm -rf "$OUT"; exit $RC
