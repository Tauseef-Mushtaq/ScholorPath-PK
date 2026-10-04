#!/bin/bash
# Compiles the pure profile modules (validation, completion) and runs unit tests. No DB, no network.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/profile/validation.ts src/lib/profile/completion.ts src/lib/profile/types.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict || exit 1
node "$HERE/validation.test.cjs" "$OUT"; RC=$?
rm -rf "$OUT"; exit $RC
