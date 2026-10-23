#!/usr/bin/env bash
# Helper for passing environment variables to wasm and common config.
# Allows accessing ~/.bb-crs and ./ (more can be added as parameters to this script).
set -eu
export WASMTIME_BACKTRACE_DETAILS=1
# Wasmtime 46 needs shared memory enabled explicitly. Older wasmtimes don't know the option.
shared_memory=$(wasmtime run -W help 2>&1 | grep -q shared-memory && echo -Wshared-memory=y || true)
exec wasmtime run \
  -Wthreads=y \
  $shared_memory \
  -Sthreads=y \
  ${HARDWARE_CONCURRENCY:+--env HARDWARE_CONCURRENCY} \
  --env HOME \
  ${MAIN_ARGS:+--env MAIN_ARGS} \
  ${BB_BENCH:+--env BB_BENCH} \
  --dir=$HOME/.bb-crs \
  --dir=. \
  "$@"
