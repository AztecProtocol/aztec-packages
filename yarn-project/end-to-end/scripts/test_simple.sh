#!/bin/bash
set -eu

export CHROME_BIN=/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome
export HARDWARE_CONCURRENCY=16
export RAYON_NUM_THREADS=1
export LOG_LEVEL=${LOG_LEVEL:-verbose}
export DEBUG_COLORS=1
export NODE_NO_WARNINGS=1

node --experimental-vm-modules ../node_modules/.bin/jest --testTimeout=300000 --forceExit --runInBand $1