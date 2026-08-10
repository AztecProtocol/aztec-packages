#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
transport="${1:-uds}"

(cd "$DIR" && node --no-warnings dest/package_test.js --transport "$transport")

# Startup/teardown failure-mode tests exercise the uds connect path only.
if [ "$transport" = "uds" ]; then
  (cd "$DIR" && node --no-warnings dest/reliability_test.js)
fi
