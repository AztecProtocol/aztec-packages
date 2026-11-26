#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/wsdb"
WSDB_BINARY=aztec-wsdb
# The wire contract, owned by barretenberg's wsdb-ref; both the TS client and the C++ server codegen
# from it. Read from the working tree for now: see the NOTE in cpp/CMakeLists.txt for where it comes
# from once native-packages leaves aztec-packages.
WSDB_SCHEMA="$ROOT/barretenberg/cpp/src/barretenberg/wsdb_ref/wsdb_schema.jsonc"

IPC_CODEGEN_DIR="$ROOT/ipc-codegen"

function generate_ts_package {
  node --experimental-strip-types --no-warnings \
    "$IPC_CODEGEN_DIR/src/generate.ts" \
    --schema "$WSDB_SCHEMA" \
    --lang ts \
    --client \
    --out "$PKG/ts/src/generated" \
    --package "$PKG/ts" \
    --package-name @aztec-labs/wsdb \
    --binary-name "$WSDB_BINARY" \
    --package-transports uds,shm \
    --package-ipc-path-args 'msgpack,run,--input,{path}' \
    "$@"
}

# Build the standalone aztec-wsdb binary.
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target "$WSDB_BINARY" wsdb_tests wsdb_bench
}

# Cross-compile aztec-wsdb for a non-host release platform with zig (cpp/CMakePresets.json).
function build_cross {
  local platform=$1
  echo_header "wsdb build_cross $platform"
  (cd cpp && cmake --preset "$platform" >/dev/null && cmake --build --preset "$platform")
}

# Builds unconditionally: the wsdb make step restores the generated TS package (ts/) and the test and bench binaries
# from the cache instead when it can.
function build_package {
  echo_header "wsdb build"
  build_native
  generate_ts_package --package-native "$(arch)-$(os)=$PKG/cpp/build/bin/$WSDB_BINARY"
  npm_install_deps
  yarn build
}

# Through make, so the build is restored from the cache when it can be.
function build {
  make -C "$root" wsdb
}

# Emit test commands for the CI test engine, keyed by the wsdb-tests make step.
function test_cmds {
  echo "${STEP_KEY:-disabled-cache}:CPUS=8:TIMEOUT=600s native-packages/wsdb/cpp/build/bin/wsdb_tests"
}

# The tree benchmarks (cpp/src/benchmark), in the repo's bench-out/*.bench.json form. Every
# family at 1024 leaves: about a minute, where the full sweep to 8192 runs over ten minutes.
function bench_cmds {
  # Keyed by the wsdb-benches make step.
  echo "${STEP_KEY:-disabled-cache}:CPUS=8 native-packages/wsdb/bootstrap.sh bench"
}

function bench {
  echo_header "wsdb bench"
  rm -rf bench-out && mkdir -p bench-out
  HARDWARE_CONCURRENCY=${CPUS:-8} cpp/build/bin/wsdb_bench --benchmark_filter='/1024/' \
    --benchmark_out=bench-out/wsdb.json
  jq '[.benchmarks[] | { name: "\(.name)/seconds", value: .real_time, unit: .time_unit }]' \
    bench-out/wsdb.json > bench-out/wsdb.bench.json
}

# Manual: build then run the tests directly.
function test {
  echo_header "wsdb test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf ts node_modules cpp/build cpp/build-*
}

function release {
  build_native
  for platform in arm64-linux amd64-macos arm64-macos; do
    build_cross $platform
  done
  generate_ts_package --package-every-platform \
    --package-native "$(arch)-$(os)=$PKG/cpp/build/bin/$WSDB_BINARY" \
    --package-native "arm64-linux=$PKG/cpp/build-arm64-linux/bin/$WSDB_BINARY" \
    --package-native "amd64-macos=$PKG/cpp/build-amd64-macos/bin/$WSDB_BINARY" \
    --package-native "arm64-macos=$PKG/cpp/build-arm64-macos/bin/$WSDB_BINARY"
  npm_install_deps
  yarn build
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f generate_ts_package build_native build_cross build_package build test_cmds test bench_cmds bench clean release

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
