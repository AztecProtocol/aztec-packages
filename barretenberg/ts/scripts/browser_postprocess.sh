#!/usr/bin/env bash
# Post-build pass for the browser bundle.
#
# Under the previous wasm runtime we maintained parallel `node/`+`browser/`
# implementation trees and rewrote imports here. The Emscripten loader in
# `barretenberg_wasm/barretenberg_wasm_main/index.ts` is environment-agnostic
# (it imports the `barretenberg.js` glue dynamically and lets Emscripten pick
# the right environment), so the only browser-specific thing left to do is
# strip out the Node-only worker factory and the `worker_threads` import path.
set -euo pipefail

DIR="./dest/browser"

# Remove the Node-only worker factory -- browsers spawn workers via the
# Emscripten glue's own Web Worker code path. Also strip the helpers/node
# subtree, which references `worker_threads`/`fs`.
rm -rf "$DIR/barretenberg_wasm/barretenberg_wasm_main/factory" 2>/dev/null || true
rm -rf "$DIR/barretenberg_wasm/helpers/node" 2>/dev/null || true

# Rewrite any leftover `helpers/node` import to a no-op browser facade.
# The browser bundle is consumed by Webpack/Vite which tree-shakes
# unreachable code.
find "$DIR" -type f -name "*.js" -exec \
    sed -i 's|helpers/node/index\.js|helpers/index.js|g' \
    {} +

echo "browser_postprocess: stripped Node-only modules under $DIR"
