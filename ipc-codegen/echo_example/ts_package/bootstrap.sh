#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
REPO_ROOT="$(cd "$CODEGEN/.." && pwd)"
NODE="node --experimental-strip-types --no-warnings"

# Both the spawned binary and the wasm reactor come from the Rust crate, so the package
# offers one implementation over three transports.
(cd "$DIR/../rust" && ./bootstrap.sh)

# This machine's per-platform package, in the form process.platform-process.arch already spells.
platform="$(node -p 'process.platform + "-" + process.arch')"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang ts \
  --package "$DIR" \
  --package-name "@aztec/echo-ipc" \
  --binary-name echo_server \
  --package-transports uds,shm,wasm \
  --package-wasm-module "echo.wasm=$DIR/../rust/target/wasm32-wasip1/release/echo_wire_compat.wasm" \
  --package-native "$platform=$DIR/../rust/target/debug/echo_server" \
  --ipc-runtime-dependency "file:../../../ipc-runtime/ts"

# ipc-runtime is built by the Makefile (ipc-codegen depends on it) so its ts/dest
# and NAPI addon are ready for the file: link below; don't reinstall the shared
# ipc-runtime/ts here — concurrent build units doing so corrupt its node_modules.

rm -rf "$DIR/node_modules"
(cd "$DIR" && npm install --omit=optional --no-package-lock --quiet)
(cd "$DIR" && npm run build --silent)
