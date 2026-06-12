#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
CODEGEN="$(cd "$DIR/../.." && pwd)"
REPO_ROOT="$(cd "$CODEGEN/.." && pwd)"
NODE="node --experimental-strip-types --experimental-transform-types --no-warnings"

$NODE "$CODEGEN/src/generate.ts" \
  --schema "$DIR/../schema/schema.json" \
  --lang ts \
  --client \
  --out "$DIR/src/generated" \
  --prefix Echo \
  --strip-method-prefix \
  --package "$DIR" \
  --package-name "@aztec/echo-ipc" \
  --binary-name echo_server \
  --package-transports uds,shm \
  --ipc-runtime-dependency "file:../../../ipc-runtime/ts"

(cd "$DIR/../cpp" && ./bootstrap.sh)
(cd "$REPO_ROOT/ipc-runtime" && ./bootstrap.sh)
(cd "$REPO_ROOT/ipc-runtime/ts" && yarn install --immutable && yarn build)

platform_dir="$(
  node -e "const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch] ?? process.arch; const os = { linux: 'linux', darwin: 'macos' }[process.platform] ?? process.platform; console.log(arch + '-' + os);"
)"
mkdir -p "$DIR/build/$platform_dir"
cp "$DIR/../cpp/build/bin/echo_server" "$DIR/build/$platform_dir/echo_server"

rm -rf "$DIR/node_modules"
(cd "$DIR" && npm install --omit=optional --no-package-lock --quiet)
(cd "$DIR" && npm run build --silent)
(cd "$DIR" && npm run prepare_arch_packages --silent)
