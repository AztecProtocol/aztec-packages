#!/usr/bin/env bash
# Helper for passing environment variables to wasm and common config.
# Allows accessing ~/.bb-crs and ./ (more can be added as parameters to this script).
set -eu

exec wasmtime run \
  -Wthreads=y \
  -Sthreads=y \
  --env HARDWARE_CONCURRENCY \
  --env WASM_BACKTRACE_DETAILS=1 \
  --env HOME \
  ${MAIN_ARGS:+--env MAIN_ARGS} \
  --dir=$HOME/.bb-crs \
  --dir=. \
  "$@"
