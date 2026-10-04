#!/bin/bash
# Compiles the PURE Module 11 modules (no Supabase, no network, no real embedding provider) and runs the unit tests.
# These are unit + MOCK-based tests only. They are NOT live Supabase and NOT live Gemini verification.
# TSC_EXTRA lets a sandbox without node_modules pass e.g. "--ignoreConfig --typeRoots <dir> --types node".
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/knowledge/index.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict ${TSC_EXTRA:-} || exit 1
node "$HERE/knowledge.test.cjs" "$OUT"; RC=$?
rm -rf "$OUT"; exit $RC
