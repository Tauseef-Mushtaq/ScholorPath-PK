#!/bin/bash
# Compiles the pure public filter/search helpers and runs unit tests. No DB, no network.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/public/filters.ts src/lib/public/format.ts src/lib/public/types.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict || exit 1
node "$HERE/filters.test.cjs" "$OUT"; RC=$?
rm -rf "$OUT"; exit $RC
