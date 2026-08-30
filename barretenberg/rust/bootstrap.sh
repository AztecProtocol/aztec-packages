#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# The crate generates its own bindings, so the hash covers the schema and
# ipc-codegen (see .rebuild_patterns) rather than the whole ts build.
hash=$(hash_str $(cache_content_hash .rebuild_patterns))

# Generate the Rust client from the checked-in bb schema via ipc-codegen.
# --ffi also emits the Backend trait, error type and FFI backend, so the
# generated client never depends on hand-maintained copies of them.
function generate {
  local root=$(git rev-parse --show-toplevel)
  (cd barretenberg-rs && node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$root/ipc-codegen/src/generate.ts" \
    --schema "$root/barretenberg/cpp/src/barretenberg/bbapi/bb_schema.json" \
    --lang rust \
    --client \
    --ffi \
    --strip-method-prefix \
    --strip-type-prefix \
    --out src/generated)
}

function build {
  echo_header "barretenberg-rs build"

  if ! cache_download barretenberg-rs-$hash.tar.gz; then
    generate

    # Build all targets
    # BB_LIB_DIR tells build.rs to use local lib instead of downloading (ffi feature is on by default)
    # Must use absolute path since build.rs runs from a different directory
    BB_LIB_DIR="$(cd ../cpp/build/lib && pwd)" denoise "cargo build --release"

    # Upload build artifacts and generated source files to cache
    cache_upload barretenberg-rs-$hash.tar.gz target/release barretenberg-rs/src/generated
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

  # Transport tests (spawn bb and talk to it through ipc-runtime)
  # Transport tests only: --no-default-features skips FFI, which needs libbb-external.a
  denoise "cargo test --release --no-default-features --features ipc-runtime"

  # Run FFI backend tests (requires libbb-external.a from cpp build)
  # BB_LIB_DIR tells build.rs to use local lib instead of downloading
  # Must use absolute path since build.rs runs from a different directory
  BB_LIB_DIR="$(cd ../cpp/build/lib && pwd)" RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" denoise "cargo test --release --features ffi"
}

function release {
  echo_header "barretenberg-rs release"

  local version=${REF_NAME#v}

  # Set the workspace version to match the release tag
  sed -i "s/^version = \".*\"/version = \"$version\"/" Cargo.toml

  # Generated files must exist (created during build step, or generate now)
  if [ ! -d barretenberg-rs/src/generated ]; then
    echo "Generated files not found, generating..."
    generate
  fi

  # Check if this version is already published on crates.io (idempotent re-runs).
  if curl -sf -H "User-Agent: aztec-packages-ci (tech@aztec-labs.com)" "https://crates.io/api/v1/crates/barretenberg-rs/$version" | jq -e '.version.num' &>/dev/null; then
    echo "barretenberg-rs@$version already published on crates.io. Skipping."
    return 0
  fi

  # Publish to crates.io (--allow-dirty because version was just set and generated files are gitignored)
  local extra_flags=""
  if ! gh release view "v$version" --repo AztecProtocol/barretenberg &>/dev/null; then
    # No matching GitHub release yet — skip verification build (which would try to download libbb-external.a)
    echo "No GitHub release found for v$version, adding --no-verify (pass REF_NAME matching a release for full verification)"
    extra_flags="--no-verify"
  fi
  BB_LIB_DIR="$(cd ../cpp/build/lib && pwd)" retry "denoise 'do_or_dryrun cargo publish --allow-dirty $extra_flags -p barretenberg-rs'"
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
  local version=${BARRETENBERG_VERSION:-$(gh release list --repo AztecProtocol/barretenberg --limit 1 --json tagName --jq '.[0].tagName' | sed 's/^v//')}
  echo "Testing download with version: $version"

  # Retry logic for network flakiness (GitHub releases can be flaky)
  local max_retries=3
  local retry=0
  local success=false
  while [ $retry -lt $max_retries ]; do
    if BARRETENBERG_VERSION=$version RUSTFLAGS="-C link-arg=-Wl,--allow-multiple-definition" \
        cargo test --release --features ffi -p barretenberg-rs 2>&1; then
      success=true
      break
    fi
    retry=$((retry + 1))
    if [ $retry -lt $max_retries ]; then
      echo "Attempt $retry failed, retrying in 5 seconds..."
      sleep 5
      # Clean to force re-download
      cargo clean -p barretenberg-rs 2>/dev/null || true
    fi
  done

  if [ "$success" = false ]; then
    echo "Download test failed after $max_retries attempts"
    exit 1
  fi

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
    default_cmd_handler "$@"
esac
