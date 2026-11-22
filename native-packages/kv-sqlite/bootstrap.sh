#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/kv-sqlite"
KV_BINARY=kv-sqlite
KV_LIBRARY=libkv_sqlite.so

# While kv-sqlite lives in aztec-packages it builds against this checkout's ipc-codegen and ipc-runtime (the C++
# runtime by add_subdirectory, the TS runtime portaled), so the build follows their sources (.rebuild_patterns).
hash=$(cache_content_hash .rebuild_patterns)

function ipc_codegen {
  "$ROOT/ipc-codegen/bin/ipc-codegen.mjs" "$@"
}

# The TS packages: the Kv client over the binary (uds), the library (napi) and the wasm module, and the Files
# service's server bindings, for the host that keeps a wasm module's files.
function generate_ts {
  ipc_codegen --schema kv_schema.jsonc --lang ts \
    --package "$PKG/ts" \
    --package-name @aztec-labs/kv-sqlite \
    --binary-name "$KV_BINARY" \
    --ffi=kv_sqlite \
    --package-transports uds,napi,wasm \
    --package-napi-library "$KV_LIBRARY" \
    --package-wasm-module "kv_sqlite.wasm=$PKG/cpp/build-wasm/bin/kv_sqlite.wasm" \
    "$@"
  ipc_codegen --schema files_schema.jsonc --lang ts --server \
    --package "$PKG/files" \
    --package-name @aztec-labs/kv-sqlite-files
}

# The binary and the library for this machine, and the wasm module.
function build_cpp {
  (cd cpp && cmake --preset default && cmake --build build)
  (cd cpp && cmake --preset wasm && cmake --build build-wasm)
}

function build {
  echo_header "kv-sqlite build"
  build_cpp
  generate_ts \
    --package-native "$(arch)-$(os)=$PKG/cpp/build/bin/$KV_BINARY" \
    --package-native "$(arch)-$(os):$KV_LIBRARY=$PKG/cpp/build/lib/$KV_LIBRARY"
  npm_install_deps
  yarn build
}

function test_cmds {
  echo "$hash native-packages/kv-sqlite/cpp/build/bin/kv_tests"
  echo "$hash native-packages/kv-sqlite/scripts/kv_test.sh"
}

# Manual: build then run the tests directly.
function test {
  echo_header "kv-sqlite test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf ts files node_modules cpp/build cpp/build-wasm
}

# Not yet in the root bootstrap's release lists: this machine's platform only.
function release {
  build
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
  (cd files && retry "deploy_npm ${REF_NAME#v}")
}

export -f ipc_codegen generate_ts build_cpp build test_cmds test clean release

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
