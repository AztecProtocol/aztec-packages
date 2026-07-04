#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/acvm"
ACVM_BINARY=acvm-sim
# This package owns the wire contract; both the TS client and the Rust server
# codegen from this schema.
ACVM_SCHEMA="$PKG/acvm_schema.jsonc"

hash=$(hash_str \
  $(../../ipc-runtime/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns))

# Regenerate both sides of the wire contract from the schema: the Rust server
# dispatch (built into the acvm-sim binary) and the @aztec/acvm-sim TS client.
function generate_code {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ACVM_SCHEMA" \
    --lang rust --server --client --uds \
    --out "$PKG/rust/src/generated"
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ACVM_SCHEMA" \
    --lang ts \
    --client \
    --out "$PKG/ts/src/generated" \
    --package "$PKG/ts" \
    --package-name @aztec/acvm-sim \
    --binary-name "$ACVM_BINARY" \
    --package-transports uds \
    --package-ipc-path-args 'serve,--input,{path}'
}

# Build the standalone acvm-sim binary. It links ipc-runtime (compiled here via the
# `cc` crate) and the noir submodule's ACVM crates (path deps). rust-toolchain.toml
# pins the same rustc as noir (1.89).
function build_native {
  (cd rust && cargo build --release --locked)
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "rust/target/release/$ACVM_BINARY" "$target_dir/$ACVM_BINARY"
}

function build {
  echo_header "acvm-sim build"
  generate_code
  build_native
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh "$(arch)-$(os)=build/$(arch)-$(os)/$ACVM_BINARY")
}

# Rust unit + IPC round-trip tests.
function test_cmds {
  echo "$hash:CPUS=4:TIMEOUT=600s cd native-packages/acvm/rust && cargo test --release --locked"
}

function test {
  echo_header "acvm-sim test"
  build
  (cd rust && cargo test --release --locked)
}

function clean {
  rm -rf ts/node_modules ts/build ts/dest rust/target rust/src/generated ts/src/generated
}

function release {
  generate_code
  build_native
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f generate_code build_native build test_cmds test clean release

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
