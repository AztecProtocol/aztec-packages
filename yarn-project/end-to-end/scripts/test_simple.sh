#!/bin/bash
set -eu

HARDWARE_CONCURRENCY=16 RAYON_NUM_THREADS=1 LOG_LEVEL=${LOG_LEVEL:-verbose} DEBUG_COLORS=1 NODE_NO_WARNINGS=1 \
  node --experimental-vm-modules ../node_modules/.bin/jest --testTimeout=300000 --forceExit --runInBand $1