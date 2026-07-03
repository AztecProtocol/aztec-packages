#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/wsdb"
WSDB_BINARY=aztec-wsdb
# This package owns the wire contract; both the TS client and the C++ server
# codegen from this schema.
WSDB_SCHEMA="$PKG/wsdb_schema.jsonc"

hash=$(hash_str \
  $(../../barretenberg/cpp/bootstrap.sh hash) \
  $(../../ipc-runtime/bootstrap.sh hash) \
  $(../lmdblib/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns))

function generate_ts_package {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$WSDB_SCHEMA" \
    --lang ts \
    --client \
    --out "$PKG/ts/src/generated" \
    --package "$PKG/ts" \
    --package-name @aztec/wsdb \
    --binary-name "$WSDB_BINARY" \
    --package-transports uds,shm \
    --package-ipc-path-args 'msgpack,run,--input,{path}'
}

# Build the standalone aztec-wsdb binary against the prebuilt barretenberg
# artifacts (default preset -> barretenberg/cpp/build). bb is never rebuilt here.
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target "$WSDB_BINARY" wsdb_tests
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$build_dir/bin/$WSDB_BINARY" "$target_dir/$WSDB_BINARY"
}

function build {
  echo_header "wsdb build"
  generate_ts_package
  build_native
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh "$(arch)-$(os)=build/$(arch)-$(os)/$WSDB_BINARY")
}

# Emit test commands for the CI test engine. The decoupled wsdb_tests use no
# barretenberg headers; they link libbarretenberg.a only for the poseidon2 c_bind.
# (The optional bb-header parity/equivalence target, WSDB_BUILD_BB_TESTS, is manual.)
function test_cmds {
  echo "$hash:CPUS=8:TIMEOUT=600s native-packages/wsdb/cpp/build/bin/wsdb_tests"
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
  generate_ts_package
  build_native
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f generate_ts_package build_native build test_cmds test clean release

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
