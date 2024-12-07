#!/bin/bash
# This is called from the outer script test.sh, but is sometimes useful to call directly.
# A "simple" test is one that doesn't use docker compose.
# If the given test is a shell script, execute it directly, otherwise assume it's a jest test and run via node.
set -eu

export CHROME_BIN=/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome
export HARDWARE_CONCURRENCY=16
export RAYON_NUM_THREADS=1
export LOG_LEVEL=${LOG_LEVEL:-verbose}
export NODE_NO_WARNINGS=1

if [[ "$1" == *".sh" ]]; then
  $1
else
  node --experimental-vm-modules ../node_modules/.bin/jest --testTimeout=300000 --forceExit --runInBand $1
fi