#!/bin/bash
# Compiles the pure Module 06 modules (constants, validation) and runs unit tests. No DB, no network.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
SRC="$(mktemp -d)"; OUT="$(mktemp -d)"
# Compile a copy outside the project so no tsconfig.json is picked up (newer TypeScript refuses explicit
# file lists next to a tsconfig). The modules use only relative imports, so a copy compiles standalone.
cp "$ROOT/src/lib/documents/constants.ts" "$ROOT/src/lib/documents/validation.ts" "$SRC/"
(cd "$SRC" && npx tsc constants.ts validation.ts --outDir "$OUT" --module commonjs --target es2020 \
  --lib es2022,dom --skipLibCheck --strict) || { rm -rf "$SRC" "$OUT"; exit 1; }
node "$HERE/validation.test.cjs" "$OUT"; RC=$?
rm -rf "$SRC" "$OUT"; exit $RC
