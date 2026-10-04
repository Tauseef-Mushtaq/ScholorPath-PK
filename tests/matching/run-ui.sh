#!/bin/bash
# Browser (Playwright/Chromium) test of /matches against the LOCAL auth+REST mock (desktop + mobile viewports).
# NOT live Supabase and NOT real RLS (that is tests/db). Needs ports 3200 and 54321 and Playwright via NODE_PATH.
# Usage: NODE_PATH=<dir with playwright> npm run test:matching-ui
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
MOCK_ENV="NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test NEXT_PUBLIC_APP_URL=http://localhost:3200"
export NODE_PATH="${NODE_PATH:-/opt/node-tools/node_modules}"
node -e "require('playwright')" 2>/dev/null || { echo "Playwright not found (set NODE_PATH). Skipping."; exit 2; }
stop() { pkill -f "[n]ext-server" 2>/dev/null; pkill -f "[n]ext start -p 3200" 2>/dev/null; pkill -f "[m]ock-supabase-auth.mjs" 2>/dev/null; sleep 1; }
stop; cd "$ROOT"
rm -rf .next; env $MOCK_ENV npm run build > /tmp/mui-build.log 2>&1 || { echo "build failed"; exit 1; }
node tests/auth-mock/mock-supabase-auth.mjs > /tmp/mui-mock.log 2>&1 &
env $MOCK_ENV npx next start -p 3200 > /tmp/mui-app.log 2>&1 &
sleep 5
node "$HERE/ui.mjs"; RC=$?
stop; exit $RC
