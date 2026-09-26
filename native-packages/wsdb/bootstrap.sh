#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/wsdb"
WSDB_BINARY=aztec-wsdb
# This package owns the wire contract; both the TS client and the C++ server
# codegen from this schema.
WSDB_SCHEMA="$PKG/wsdb_schema.jsonc"

# Everything outside this package comes from the release pinned in foundation.pin (see
# cpp/CMakeLists.txt), so the build's identity is this package plus the lmdblib sibling.
hash=$(hash_str $(../lmdblib/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

# ipc-codegen from the sparse clone cpp/CMakeLists.txt makes at configure time.
IPC_CODEGEN_DIR="$PKG/cpp/build/_deps/aztec-packages-src/ipc-codegen"

function generate_ts_package {
  node --experimental-strip-types --no-warnings \
    "$IPC_CODEGEN_DIR/src/generate.ts" \
    --schema "$WSDB_SCHEMA" \
    --lang ts \
    --client \
    --out "$PKG/ts/src/generated" \
    --package "$PKG/ts" \
    --package-name @aztec-foundation/wsdb \
    --binary-name "$WSDB_BINARY" \
    --package-transports uds,shm \
    --package-ipc-path-args 'msgpack,run,--input,{path}'
}

# Build the standalone aztec-wsdb binary against the release pinned in foundation.pin.
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target "$WSDB_BINARY" wsdb_tests wsdb_bench
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$build_dir/bin/$WSDB_BINARY" "$target_dir/$WSDB_BINARY"
}

function build {
  echo_header "wsdb build"
  build_native
  generate_ts_package
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh "$(arch)-$(os)=build/$(arch)-$(os)/$WSDB_BINARY")
}

# Emit test commands for the CI test engine.
function test_cmds {
  echo "$hash:CPUS=8:TIMEOUT=600s native-packages/wsdb/cpp/build/bin/wsdb_tests"
}

# The tree benchmarks (cpp/src/benchmark), in the repo's bench-out/*.bench.json form. Every
# family at 1024 leaves: about a minute, where the full sweep to 8192 runs over ten minutes.
function bench_cmds {
  echo "$hash:CPUS=8 native-packages/wsdb/bootstrap.sh bench"
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
  rm -rf ts node_modules cpp/build
}

function release {
  build_native
  generate_ts_package
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f generate_ts_package build_native build test_cmds test bench_cmds bench clean release

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
