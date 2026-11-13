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

# While wsdb lives in aztec-packages it builds against this checkout's barretenberg (its static
# library), ipc-runtime and ipc-codegen (see cpp/CMakeLists.txt), so the build follows their hashes.
hash=$(hash_str $(../lmdblib/bootstrap.sh hash) $(../../barretenberg/cpp/bootstrap.sh hash) \
  $(../../ipc-codegen/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

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
    --package-ipc-path-args 'msgpack,run,--input,{path}'
}

# Build the standalone aztec-wsdb binary against this checkout's barretenberg build.
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target "$WSDB_BINARY" wsdb_tests wsdb_bench
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$build_dir/bin/$WSDB_BINARY" "$target_dir/$WSDB_BINARY"
}

# Cross-compile aztec-wsdb for a non-host release platform with zig (cpp/CMakePresets.json), against
# barretenberg's build of libwsdb-ref.a for that platform.
function build_cross {
  local platform=$1
  echo_header "wsdb build_cross $platform"
  (cd cpp && cmake --preset "$platform" >/dev/null && cmake --build --preset "$platform")
  mkdir -p "ts/build/$platform"
  cp "cpp/build-$platform/bin/$WSDB_BINARY" "ts/build/$platform/$WSDB_BINARY"
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
  rm -rf ts node_modules cpp/build cpp/build-*
}

function release {
  build_native
  for platform in arm64-linux amd64-macos arm64-macos; do
    build_cross $platform
  done
  generate_ts_package
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f generate_ts_package build_native build_cross build test_cmds test bench_cmds bench clean release

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
