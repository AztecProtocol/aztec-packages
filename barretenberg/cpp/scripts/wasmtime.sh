#!/usr/bin/env bash
# Helper for passing environment variables to wasm and common config.
# Allows accessing ~/.bb-crs and ./ (more can be added as parameters to this script).
set -eu
export WASMTIME_BACKTRACE_DETAILS=1

# wasmtime >=43 split shared-memory out of -Wthreads and requires it as a separate flag.
# Older wasmtime errors out on the unknown option, so probe and add it only when supported.
SHARED_MEMORY_FLAG=""
if wasmtime run -W help 2>/dev/null | grep -q "shared-memory"; then
  SHARED_MEMORY_FLAG="-Wshared-memory=y"
fi

exec wasmtime run \
  -Wthreads=y \
  ${SHARED_MEMORY_FLAG} \
  -Sthreads=y \
  ${HARDWARE_CONCURRENCY:+--env HARDWARE_CONCURRENCY} \
  --env HOME \
  ${MAIN_ARGS:+--env MAIN_ARGS} \
  ${BB_BENCH:+--env BB_BENCH} \
  --dir=$HOME/.bb-crs \
  --dir=. \
  "$@"
