#!/usr/bin/env bash
<<<<<<< HEAD
# Helper for passing environment variables to wasm and common config.
# Allows accessing ~/.bb-crs and ./ (more can be added as parameters to this script).
set -eu

exec wasmtime run \
  -Wthreads=y \
  -Sthreads=y \
  --env HARDWARE_CONCURRENCY \
  --env WASM_BACKTRACE_DETAILS=1 \
  --env HOME \
  --env MAIN_ARGS \
  --env IGNITION_CRS_PATH \
  --env GRUMPKIN_CRS_PATH \
  --dir=$HOME/.bb-crs \
  --dir=. \
  "$@"
=======
set -eu
exec wasmtime run -Wthreads=y -Sthreads=y --env IGNITION_CRS_PATH --env GRUMPKIN_CRS_PATH --env HARDWARE_CONCURRENCY=16 --env WASM_BACKTRACE_DETAILS=1 --env HOME --env MAIN_ARGS "$@"
>>>>>>> origin/master
