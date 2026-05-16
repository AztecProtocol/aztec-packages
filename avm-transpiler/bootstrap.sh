#!/usr/bin/env bash
if [ "${1:-}" = "hash" ] && [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
  echo disabled-cache
  exit 0
fi

# Use ci3 script base.
script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
case "$script_dir" in
  /*) root=${root:-$script_dir/..} ;;
  *) root=${root:-$PWD/$script_dir/..} ;;
esac
source "$root/ci3/source_bootstrap"

if [ "${AVM_TRANSPILER:-1}" -eq 0 ]; then
  echo "AVM_TRANSPILER=0, skipping."
  exit 0
fi

function get_hash {
  if [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
    echo disabled-cache
  else
    hash_str $(../noir/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns)
  fi
}

function ensure_build_metadata {
  export GIT_COMMIT=$(git -C ../noir/noir-repo rev-parse HEAD)
  export SOURCE_DATE_EPOCH=0
  export GIT_DIRTY=false
}
export RUSTFLAGS="-Dwarnings"

function build_native {
  echo_header "avm-transpiler build_native"
  local hash=$(get_hash)
  artifact=avm-transpiler-$hash.tar.gz
  if ! cache_download $artifact; then
    ensure_build_metadata
    # Serialize cargo/rustup operations to avoid race conditions with noir build
    # which may run in parallel and share the same RUSTUP_HOME/CARGO_HOME.
    (
      flock -x 200
      denoise "cargo build --release --locked --bin avm-transpiler --lib"
    ) 200>/tmp/rustup.lock

    denoise "cargo fmt --check"
    denoise "cargo clippy --release --locked --bin avm-transpiler --lib"
    cache_upload $artifact target/release/avm-transpiler target/release/libavm_transpiler.a
  fi
}

function build_cross {
  local target=$1
  echo_header "avm-transpiler build_cross $target"

  local hash=$(get_hash)
  cross_compile_artifact=avm-transpiler-cross-$target-$hash.tar.gz
  if ! cache_download $cross_compile_artifact; then
    ensure_build_metadata
    # We build libraries to be linked by barretenberg
    # For now we only use the zig build for macOS targets

    # Determine rust target outside of subshell
    local rust_target
    case "$target" in
      arm64-linux)
        rust_target=aarch64-unknown-linux-gnu
        ;;
      amd64-macos)
        rust_target=x86_64-apple-darwin
        ;;
      arm64-macos)
        rust_target=aarch64-apple-darwin
        ;;
      amd64-windows)
        rust_target=x86_64-pc-windows-gnu
        ;;
      *)
        echo_stderr "Unknown target: $target"
        exit 1
        ;;
    esac

    # Serialize rustup operations to avoid race conditions with noir build
    (
      flock -x 200
      if ! command -v cargo-zigbuild >/dev/null 2>&1; then
        cargo install --locked cargo-zigbuild
      fi

      if ! rustup target list --installed | grep -q "^$rust_target$"; then
        echo "Installing Rust target: $rust_target"
        rustup target add "$rust_target"
      fi
    ) 200>/tmp/rustup.lock

    cargo zigbuild --release --target "$rust_target" --lib

    cache_upload $cross_compile_artifact target/$rust_target/release/libavm_transpiler.a
  fi
}

function build {
  build_native
  if [ "$CI_FULL" -eq 1 ]; then
    build_cross amd64-macos
    build_cross arm64-macos
    build_cross arm64-linux
  fi
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    get_hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
