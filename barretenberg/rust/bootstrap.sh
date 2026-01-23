#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash depends on ts because ts generates the Rust bindings
hash=$(hash_str $(../ts/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

function build {
  echo_header "barretenberg-rs build"

  if ! cache_download barretenberg-rs-$hash.tar.gz; then
    # Generate Rust bindings from msgpack schema (uses ts-node, no build needed)
    (cd ../ts && yarn generate)

    # Build all targets
    denoise "cargo build --release"

    # Upload build artifacts and generated source files to cache
    cache_upload barretenberg-rs-$hash.tar.gz target/release barretenberg-rs/src/generated_types.rs barretenberg-rs/src/api.rs
  fi
}

function test_cmds {
  # List all test binaries
  local prefix=$hash
  echo "$prefix barretenberg/rust/scripts/run_test.sh"
}

function test {
  echo_header "barretenberg-rs test"

  # Ensure Cargo is in PATH
  if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
  fi

  # Run PipeBackend tests (spawns bb binary, no FFI linking needed)
  # FFI tests require: RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" cargo test --features ffi
  denoise "cargo test --release"
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  "ci")
    build
    test
    ;;
  ""|"fast"|"full")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  bench|bench_cmds)
    # Empty handling just to make this command valid.
    ;;
  test|test_cmds)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
