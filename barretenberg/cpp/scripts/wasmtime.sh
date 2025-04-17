#!/usr/bin/env bash
set -eu
exec wasmtime run -Wthreads=y -Sthreads=y --env IGNITION_CRS_PATH --env GRUMPKIN_CRS_PATH --env HARDWARE_CONCURRENCY=16 --env WASM_BACKTRACE_DETAILS=1 --env HOME --env MAIN_ARGS "$@"
