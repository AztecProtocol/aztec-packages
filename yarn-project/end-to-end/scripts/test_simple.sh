#!/usr/bin/env bash
# This is called from the outer script run_test.sh, but is sometimes useful to call directly.
# A "simple" test is one that doesn't use docker compose.
# If the given test is a shell script, execute it directly, otherwise assume it's a jest test and run via node.
# Jest arguments:
# - testTimeout is currently 5 minutes for any one test. TODO: Drive this down.
# - forceExit is currently enabled due to incorrect cleanup causing exit hangs. TODO: Fix.
# - cacheDirectory is used to separate jests greedy consuming /tmp space for transforms. TODO: Fix 80+MB contract json.
#   Note that jests --no-cache is a lie, that just means don't use the cache. It still creates the cache. Unavoidable.
# - runInBand is provided, to run the test in the main thread (no child process). It avoids various issues.
set -eu

cd $(dirname $0)/..

export CHROME_BIN=/opt/ms-playwright/chromium-1148/chrome-linux/chrome
export HARDWARE_CONCURRENCY=${CPUS:-16}
export RAYON_NUM_THREADS=1
export LOG_LEVEL=${LOG_LEVEL:-verbose}
export NODE_NO_WARNINGS=1
export FORCE_COLOR=1

if [[ "$1" == *".sh" ]]; then
  $1
else
  [ -n "${JEST_CACHE_DIR:-}" ] && args="--cacheDirectory=$JEST_CACHE_DIR"
  node --experimental-vm-modules ../node_modules/.bin/jest \
  --testTimeout=300000 \
  --forceExit \
  --no-cache \
  ${args:-} \
  --runInBand $1
fi
