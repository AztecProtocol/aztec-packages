#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
REPO_ROOT="$(cd "$CODEGEN/.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang ts \
  --package "$DIR" \
  --package-name "@aztec/echo-ipc" \
  --binary-name echo_server \
  --package-transports uds,shm,wasm \
  --package-wasm-module echo.wasm \
  --ipc-runtime-dependency "file:../../../ipc-runtime/ts"

# Both the spawned binary and the wasm reactor come from the Rust crate, so the package
# offers one implementation over three transports.
(cd "$DIR/../rust" && ./bootstrap.sh)
# ipc-runtime is built by the Makefile (ipc-codegen depends on it) so its ts/dest
# and NAPI addon are ready for the file: link below; don't reinstall the shared
# ipc-runtime/ts here — concurrent build units doing so corrupt its node_modules.

platform_dir="$(
  node -e "const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch] ?? process.arch; const os = { linux: 'linux', darwin: 'macos' }[process.platform] ?? process.platform; console.log(arch + '-' + os);"
)"
mkdir -p "$DIR/build/$platform_dir" "$DIR/wasm"
cp "$DIR/../rust/target/debug/echo_server" "$DIR/build/$platform_dir/echo_server"
cp "$DIR/../rust/target/wasm32-wasip1/release/echo_wire_compat.wasm" "$DIR/wasm/echo.wasm"

rm -rf "$DIR/node_modules"
(cd "$DIR" && npm install --omit=optional --no-package-lock --quiet)
(cd "$DIR" && npm run build --silent)
(cd "$DIR" && npm run prepare_arch_packages --silent)
