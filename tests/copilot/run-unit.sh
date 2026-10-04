#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
node tests/copilot/validation.test.cjs
echo "copilot unit OK"
