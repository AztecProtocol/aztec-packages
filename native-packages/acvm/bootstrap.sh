#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/acvm"
ACVM_BINARY=aztec-acvm
WASM_TARGET=wasm32-wasip1

# Everything outside this package comes from the release pinned in foundation.pin: ipc-codegen from
# npm, the ipc-runtime crate from crates.io (rust/Cargo.toml pins the same version), and the noir
# crates at the version rust/Cargo.toml names. The TS runtime is portaled from this tree, as wsdb's is.
hash=$(cache_content_hash .rebuild_patterns)
version=$(sed 's/^v//' "$PKG/foundation.pin")

# The ipc-codegen to generate with: the pinned release, or a checkout's (IPC_CODEGEN_DIR) while
# the release lacks something this package needs.
function ipc_codegen {
  if [ -n "${IPC_CODEGEN_DIR:-}" ]; then
    node --experimental-strip-types --no-warnings "$IPC_CODEGEN_DIR/src/generate.ts" "$@"
  else
    npx -y "@aztec-foundation/ipc-codegen@$version" "$@"
  fi
}

function check_pins {
  if ! grep -q "^ipc-runtime = { version = \"=$version\"" rust/Cargo.toml; then
    echo_stderr "rust/Cargo.toml's ipc-runtime must be =$version, the version foundation.pin names."
    exit 1
  fi
}

function generate {
  rm -rf rust/src/generated
  # The Acvm service: served by the crate, and called by its tests over ipc-runtime.
  ipc_codegen --schema acvm_schema.jsonc --lang rust --server --client --uds --ffi \
    --out rust/src/generated/acvm
  # The Oracle service: the crate's client to it, natively over ipc-runtime and in wasm over
  # host_call, and the server its tests answer foreign calls with.
  ipc_codegen --schema oracle_schema.jsonc --lang rust --server --client --uds \
    --out rust/src/generated/oracle
  ipc_codegen --schema acvm_schema.jsonc --lang ts \
    --package "$PKG/ts" \
    --package-name @aztec-labs/acvm \
    --binary-name "$ACVM_BINARY" \
    --prefix Acvm \
    --strip-method-prefix \
    --package-transports uds,wasm \
    --package-ipc-path-args 'msgpack,run,--input,{path}' \
    --package-wasm-module acvm.wasm
  # Server bindings for the Oracle service, for the caller that answers foreign calls.
  ipc_codegen --schema oracle_schema.jsonc --lang ts --server \
    --package "$PKG/oracle" \
    --package-name @aztec-labs/acvm-oracle
}

function build_native {
  (cd rust && cargo build --locked --release --bin "$ACVM_BINARY")
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "rust/target/release/$ACVM_BINARY" "$target_dir/$ACVM_BINARY"
}

function build_wasm {
  (cd rust && cargo build --locked --release --lib --target $WASM_TARGET --no-default-features --features wasm)
  mkdir -p ts/wasm
  cp "rust/target/$WASM_TARGET/release/aztec_acvm.wasm" ts/wasm/acvm.wasm
}

function build {
  echo_header "acvm build"
  check_pins
  generate
  build_native
  build_wasm
  npm_install_deps
  yarn build
  yarn workspace @aztec-labs/acvm run prepare_arch_packages "$(arch)-$(os)=build/$(arch)-$(os)/$ACVM_BINARY"
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

function release {
  check_pins
  generate
  build_native
  build_wasm
  npm_install_deps
  yarn build
  yarn workspace @aztec-labs/acvm run prepare_arch_packages
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
  (cd oracle && retry "deploy_npm ${REF_NAME#v}")
}

export -f ipc_codegen check_pins generate build_native build_wasm build test_cmds test_rust test clean release

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
