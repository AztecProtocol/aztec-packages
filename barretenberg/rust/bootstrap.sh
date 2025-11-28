#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# Hash depends on ts because ts generates the Rust bindings
hash=$(hash_str $(../ts/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

function build {
  echo_header "barretenberg-rs build"

  if ! cache_download barretenberg-rs-$hash.tar.gz; then
    # Ensure Cargo is in PATH
    if [ -f "$HOME/.cargo/env" ]; then
      source "$HOME/.cargo/env"
    fi

    # Clean previous build artifacts
    cargo clean

    # Build all targets
    cargo build --release

    # Upload build artifacts to cache
    cache_upload barretenberg-rs-$hash.tar.gz target/release
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

  # Run all tests
  cargo test --release
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
