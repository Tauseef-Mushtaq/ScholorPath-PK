#!/bin/bash
# Compiles the PURE Module 12 modules (no Supabase, no network, no real Gemini) and runs the unit tests.
# Unit + MOCK tests only: NOT live Gemini and NOT live Supabase verification.
# TSC_EXTRA lets a sandbox without node_modules pass e.g. "--ignoreConfig --typeRoots <dir> --types node".
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$(mktemp -d)"
cd "$ROOT" && npx tsc src/lib/assistant/index.ts \
  --outDir "$OUT" --module commonjs --target es2020 --skipLibCheck --strict ${TSC_EXTRA:-} || exit 1
node "$HERE/assistant.test.cjs" "$OUT/assistant"; RC=$?
rm -rf "$OUT"; exit $RC
