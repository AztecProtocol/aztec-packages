#!/usr/bin/env bash
# Use ci3 script base.
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

# The crate generates its own bindings, so the hash covers the schema and
# ipc-codegen (see .rebuild_patterns) rather than the whole ts build.
hash=$(hash_str $(cache_content_hash .rebuild_patterns))

# Generate the Rust client from the checked-in bb schema via ipc-codegen.
# --ffi also emits the Backend trait, error type and FFI backend, so the
# generated client never depends on hand-maintained copies of them.
function generate {
  local root=$(git rev-parse --show-toplevel)
  (cd barretenberg-rs && node --experimental-strip-types --no-warnings \
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

# Stage the crate for the release's publish step (bootstrap.sh publish, on the GitHub runner), beside
# the ipc-runtime crate it depends on, and verify the staged pair builds together here, where the
# static library is at hand.
function release {
  echo_header "barretenberg-rs release"

  # crates.io is a public channel: a private release must never reach it, regardless of call path.
  "$root/scripts/assert_public_release"

  local version=${REF_NAME#v}

  # Generated files must exist (created during build step, or generate now)
  if [ ! -d barretenberg-rs/src/generated ]; then
    echo "Generated files not found, generating..."
    generate
  fi

  # Staged from a copy so the checkout is left untouched. ipc-runtime's release, which runs first,
  # staged its crate at the same relative path and at this version, so the path dependency resolves;
  # the version pin below names exactly that build.
  local crates=${RELEASE_DIR:?RELEASE_DIR is required}/crates
  local dest=$crates/barretenberg/rust
  [ -d $crates/ipc-runtime/rust ] || "$root/ipc-runtime/bootstrap.sh" stage_crate $version $crates
  mkdir -p $dest
  tar -c --exclude=./target . | tar -x -C $dest
  sed -i "s/^version = \".*\"/version = \"$version\"/" $dest/Cargo.toml
  sed -i -E "s|^(ipc-runtime = \{ path = \"[^\"]*\", version = \")[^\"]*|\1=$version|" $dest/barretenberg-rs/Cargo.toml

  local target=$(mktemp -d) bb_lib_dir=$(cd ../cpp/build/lib && pwd)
  (cd $dest && CARGO_TARGET_DIR=$target BB_LIB_DIR=$bb_lib_dir denoise "cargo build --release -p barretenberg-rs")
  rm -rf $target
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
