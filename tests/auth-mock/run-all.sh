#!/bin/bash
# Runs the auth end-to-end suite against a LOCAL MOCK of the Supabase Auth API.
# This is NOT live Supabase. It verifies this app's behavior, not Supabase's.
# Needs ports 3200 (app) and 54321 (mock). Usage: npm run test:auth
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
MOCK_ENV="NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=anon-test NEXT_PUBLIC_APP_URL=http://localhost:3200"
FAILED=0

stop_servers() {
  # [x] bracket trick keeps pkill from matching this script's own command line.
  pkill -f "[n]ext-server" 2>/dev/null; pkill -f "[n]ext start -p 3200" 2>/dev/null
  pkill -f "[m]ock-supabase-auth.mjs" 2>/dev/null; sleep 1
}

phase() { # <mock env> <app mode: mock|none> <e2e phase>
  env $1 node "$HERE/mock-supabase-auth.mjs" > /tmp/auth-mock.log 2>&1 & MP=$!
  if [ "$2" = "mock" ]; then
    (cd "$ROOT" && env $MOCK_ENV npx next start -p 3200 > /tmp/auth-app.log 2>&1) & AP=$!
  else
    (cd "$ROOT" && npx next start -p 3200 > /tmp/auth-app.log 2>&1) & AP=$!
  fi
  sleep 5
  node "$HERE/e2e.mjs" "$3" || FAILED=1
  stop_servers
}

stop_servers
cd "$ROOT"
echo "== build with mock Supabase env =="; rm -rf .next; env $MOCK_ENV npm run build > /tmp/auth-build.log 2>&1 || { echo "build failed"; exit 1; }
phase "" mock main
phase "CONFIRM=1" mock confirm
phase "TTL=5" mock refresh
echo "== build WITHOUT Supabase env =="; rm -rf .next; npm run build > /tmp/auth-build.log 2>&1 || { echo "build failed"; exit 1; }
phase "" none unconfigured
exit $FAILED
