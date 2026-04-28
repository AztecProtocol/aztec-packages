#!/bin/sh
# Build (if BUILD_CPP=1) and copy the Emscripten-emitted wasm artifacts into
# the published bb.js layout under dest/<flavor>/barretenberg_wasm/.
#
# The Emscripten target produces a triple per build:
#   - barretenberg.js          (ES6 loader / glue)
#   - barretenberg.wasm        (the wasm module itself)
#   - barretenberg.worker.mjs  (pthread worker, only with the threaded preset)
# We also publish a gzipped copy of the .wasm so existing fetch helpers that
# detect gzip magic bytes keep working.
set -e

cd $(dirname $0)/..

if [ "${BUILD_CPP:-0}" -eq 1 ]; then
  parallel --line-buffered --tag '../cpp/bootstrap.sh {}' ::: build_wasm build_wasm_threads
fi

THREADED_BIN="../cpp/build-wasm-threads/bin"
SINGLE_BIN="../cpp/build-wasm/bin"

for flavor in node node-cjs browser; do
  dest="./dest/${flavor}/barretenberg_wasm"
  mkdir -p "$dest"

  # Threaded artifact is the canonical bb.js wasm. We ship both a raw .wasm
  # (Emscripten loader expects this) and a .wasm.gz (back-compat for browser
  # fetch helpers that detect gzip).
  cp "${THREADED_BIN}/barretenberg.js"      "$dest/barretenberg.js"
  cp "${THREADED_BIN}/barretenberg.wasm"    "$dest/barretenberg.wasm"
  cp "${THREADED_BIN}/barretenberg.wasm.gz" "$dest/barretenberg.wasm.gz"
  if [ -f "${THREADED_BIN}/barretenberg.worker.mjs" ]; then
    cp "${THREADED_BIN}/barretenberg.worker.mjs" "$dest/barretenberg.worker.mjs"
  fi
done

# Browser flavor additionally ships the single-threaded fallback (used in
# environments without crossOriginIsolated headers).
if [ -f "${SINGLE_BIN}/barretenberg.wasm" ]; then
  cp "${SINGLE_BIN}/barretenberg.js"      "./dest/browser/barretenberg_wasm/barretenberg.single.js"
  cp "${SINGLE_BIN}/barretenberg.wasm"    "./dest/browser/barretenberg_wasm/barretenberg.single.wasm"
  cp "${SINGLE_BIN}/barretenberg.wasm.gz" "./dest/browser/barretenberg_wasm/barretenberg.single.wasm.gz"
fi
