#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/acvm"
ACVM_BINARY=aztec-acvm
ACVM_LIBRARY=libaztec_acvm.so
WASM_TARGET=wasm32-wasip1

# While acvm lives in aztec-packages it builds against this checkout's ipc-codegen and ipc-runtime
# (the Rust crate by path, the TS runtime portaled), so the build follows their sources
# (.rebuild_patterns). Its noir crates come by path from noir/noir-repo, so it follows those too.
hash=$(cache_content_hash .rebuild_patterns)

function ipc_codegen {
  node --experimental-strip-types --no-warnings "$ROOT/ipc-codegen/src/generate.ts" "$@"
}

function generate_rust {
  rm -rf rust/src/generated
  # The Acvm service: served by the binary, exported by the library and the wasm module, and
  # called by the crate's tests over ipc-runtime.
  ipc_codegen --schema acvm_schema.jsonc --lang rust --server --client --ffi \
    --out rust/src/generated/acvm
  # The Oracle service: the crate's client to it, and the server its tests answer foreign calls with.
  ipc_codegen --schema oracle_schema.jsonc --lang rust --server --client \
    --out rust/src/generated/oracle
}

# The TS packages: the Acvm client over the binary (uds), the library (napi) and the wasm module,
# and the Oracle service's server bindings, for the caller that answers foreign calls.
function generate_ts {
  ipc_codegen --schema acvm_schema.jsonc --lang ts \
    --package "$PKG/ts" \
    --package-name @aztec-labs/acvm \
    --binary-name "$ACVM_BINARY" \
    --prefix Acvm \
    --strip-method-prefix \
    --package-transports uds,napi,wasm \
    --package-ipc-path-args 'msgpack,run,--input,{path}' \
    --package-napi-library "$ACVM_LIBRARY" \
    --package-napi-library-env-var ACVM_NAPI_PATH \
    --package-wasm-module "acvm.wasm=$PKG/rust/target/$WASM_TARGET/release/aztec_acvm.wasm" \
    "$@"
  ipc_codegen --schema oracle_schema.jsonc --lang ts --server \
    --package "$PKG/oracle" \
    --package-name @aztec-labs/acvm-oracle
}

# The binary, the library (with its FFI exports, and none of the server's ipc-runtime) and the
# wasm module.
function build_rust {
  (cd rust && cargo build --locked --release --bin "$ACVM_BINARY")
  (cd rust && cargo build --locked --release --lib --no-default-features --features ffi)
  (cd rust && cargo build --locked --release --lib --target $WASM_TARGET --no-default-features --features ffi)
}

function build {
  echo_header "acvm build"
  generate_rust
  build_rust
  generate_ts \
    --package-native "$(arch)-$(os)=$PKG/rust/target/release/$ACVM_BINARY" \
    --package-native "$(arch)-$(os):$ACVM_LIBRARY=$PKG/rust/target/release/$ACVM_LIBRARY"
  npm_install_deps
  yarn build
}

# The library's static form for each mobile target, at rust/target/<target>/release/libaztec_acvm.a: what
# @aztec-foundation/react-native links into an app (iOS devices and simulators, Android devices and emulators).
# Pure Rust there (blake3's pure feature), so cargo needs only the targets' standard libraries.
mobile_targets="aarch64-apple-ios aarch64-apple-ios-sim aarch64-linux-android x86_64-linux-android"

function build_mobile {
  echo_header "acvm build_mobile"
  if cache_download acvm-mobile-$hash.tar.gz; then
    return
  fi
  generate_rust
  (
    flock -x 200
    rustup target add $mobile_targets
  ) 200>/tmp/rustup.lock
  for target in $mobile_targets; do
    (cd rust && cargo rustc --locked --release --lib --crate-type staticlib --target $target \
      --no-default-features --features ffi)
  done
  cache_upload acvm-mobile-$hash.tar.gz \
    $(for target in $mobile_targets; do echo rust/target/$target/release/libaztec_acvm.a; done)
}

function test_cmds {
  echo "$hash:CPUS=4 native-packages/acvm/bootstrap.sh test_rust"
  echo "$hash native-packages/acvm/scripts/acvm_test.sh"
}

function test_rust {
  (cd rust && cargo test --locked --release)
}

# Manual: build then run the tests directly.
function test {
  echo_header "acvm test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf ts oracle node_modules rust/target rust/src/generated
}

# Not yet in the root bootstrap's release lists: this machine's platform only.
function release {
  build
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
  (cd oracle && retry "deploy_npm ${REF_NAME#v}")
}

export -f ipc_codegen generate_rust generate_ts build_rust build build_mobile test_cmds test_rust test clean release

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
