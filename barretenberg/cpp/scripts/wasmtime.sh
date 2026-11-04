#!/usr/bin/env bash
# Helper for passing environment variables to wasm and common config.
# Allows accessing ~/.bb-crs and ./ (more can be added as parameters to this script).
# SINGLE_THREADED=1 runs a single-threaded build: wasi-threads would reject its unshared memory import, so it gets
# the memory from wasm_env_memory.wat instead.
set -eu
export WASMTIME_BACKTRACE_DETAILS=1
if [ "${SINGLE_THREADED:-0}" -eq 1 ]; then
  memory_args=(--preload env=$(dirname $0)/wasm_env_memory.wat)
else
  memory_args=(-Sthreads=y)
fi
exec wasmtime run \
  -Wthreads=y \
  -Wshared-memory=y \
  -Wexceptions=y \
  "${memory_args[@]}" \
  ${HARDWARE_CONCURRENCY:+--env HARDWARE_CONCURRENCY} \
  --env HOME \
  ${MAIN_ARGS:+--env MAIN_ARGS} \
  ${BB_BENCH:+--env BB_BENCH} \
  --dir=$HOME/.bb-crs \
  --dir=. \
  "$@"
