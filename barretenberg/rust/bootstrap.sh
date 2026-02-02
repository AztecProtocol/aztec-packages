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

  # Run PipeBackend tests (spawns bb binary)
  denoise "cargo test --release"

  # Run FFI backend tests (requires libbb-external.a from cpp build)
  RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" denoise "cargo test --release --features ffi"
}

function test_download {
  echo_header "barretenberg-rs download test"

  # Ensure Cargo is in PATH
  if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
  fi

  # Test that build.rs can download pre-built libraries from GitHub releases
  # Hide the local library to force download path
  local lib_path="../cpp/build/lib/libbb-external.a"
  if [ -f "$lib_path" ]; then
    mv "$lib_path" "$lib_path.bak"
    trap "mv '$lib_path.bak' '$lib_path' 2>/dev/null" EXIT
  fi

  # Clean cargo cache to force rebuild
  cargo clean -p barretenberg-rs 2>/dev/null || true

  # Build with a known release version
  local version=${BARRETENBERG_VERSION:-$(gh release list --repo AztecProtocol/aztec-packages --limit 1 --json tagName --jq '.[0].tagName' | sed 's/^v//')}
  echo "Testing download with version: $version"

  # Only run barretenberg-rs tests (not barretenberg-tests which has additional deps)
  BARRETENBERG_VERSION=$version RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" \
    denoise "cargo test --release --features ffi -p barretenberg-rs"

  # Restore the local library (trap handles this, but be explicit)
  if [ -f "$lib_path.bak" ]; then
    mv "$lib_path.bak" "$lib_path"
    trap - EXIT
  fi
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
  test|test_cmds|test_download)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
