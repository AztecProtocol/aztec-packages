#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
REPO_ROOT="$(cd "$CODEGEN/.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.jsonc" \
  --lang ts \
  --client \
  --out "$DIR/src/generated" \
  --package "$DIR" \
  --package-name "@aztec/echo-ipc" \
  --binary-name echo_server \
  --package-transports uds,shm \
  --ipc-runtime-dependency "file:../../../ipc-runtime/ts"

(cd "$DIR/../cpp" && ./bootstrap.sh)
# ipc-runtime is built by the Makefile (ipc-codegen depends on it) so its ts/dest
# and NAPI addon are ready for the file: link below; don't reinstall the shared
# ipc-runtime/ts here — concurrent build units doing so corrupt its node_modules.

platform_dir="$(
  node -e "const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch] ?? process.arch; const os = { linux: 'linux', darwin: 'macos' }[process.platform] ?? process.platform; console.log(arch + '-' + os);"
)"
mkdir -p "$DIR/build/$platform_dir"
cp "$DIR/../cpp/build/bin/echo_server" "$DIR/build/$platform_dir/echo_server"

rm -rf "$DIR/node_modules"
(cd "$DIR" && npm install --omit=optional --no-package-lock --quiet)
(cd "$DIR" && npm run build --silent)
(cd "$DIR" && npm run prepare_arch_packages --silent)
