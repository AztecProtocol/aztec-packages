#!/usr/bin/env bash
set -eu
wasmtime run -Wthreads=y -Sthreads=y --env HARDWARE_CONCURRENCY=16 --env WASM_BACKTRACE_DETAILS=1 --env HOME --env MAIN_ARGS "$@"
