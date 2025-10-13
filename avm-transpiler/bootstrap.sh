#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(../noir/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

export GIT_COMMIT="$(cat ../noir/noir-repo-ref | head -n1)-aztec"
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS="-Dwarnings"

# Temporarily duplicated with barretenberg/cpp/bootstrap.sh until part of base image
function ensure_zig {
  if command -v zig &>/dev/null; then
    return
  fi
  local arch=$(uname -m)
  local zig_version=0.15.1
  local bin_path=/opt/zig-${arch}-linux-${zig_version}
  if [ -f $bin_path/zig ]; then
    export PATH="$bin_path:$PATH"
    return
  fi
  echo "Installing zig $zig_version..."
  curl -sL https://ziglang.org/download/$zig_version/zig-${arch}-linux-$zig_version.tar.xz | sudo tar -xJ -C /opt
  export PATH="$bin_path:$PATH"
}

function build {
  echo_header "avm-transpiler build"
  artifact=avm-transpiler-$hash.tar.gz
  if ! cache_download $artifact; then
    denoise "cargo build --release --locked --bin avm-transpiler"
    denoise "cargo build --release --locked --lib"
    denoise "cargo fmt --check"
    denoise "cargo clippy"
    cache_upload $artifact target/release/avm-transpiler target/release/libavm_transpiler.a
  fi
  cross_compile_artifact=avm-transpiler-cross-$hash.tar.gz

  if [ "$(arch)" == "amd64" ] && [ "$CI" -eq 1 ]; then
    if ! cache_download $cross_compile_artifact; then
      ensure_zig
      # We build libraries to be linked by barretenberg
      # For now we only use the zig build for macOS targets
      if ! command -v cargo-zigbuild >/dev/null 2>&1; then
        cargo install --locked cargo-zigbuild
      fi

      targets=(
        x86_64-apple-darwin
        aarch64-apple-darwin
      )

      for target in "${targets[@]}"; do
        if ! rustup target list --installed | grep -q "^$target$"; then
          echo "Installing Rust target: $target"
          rustup target add "$target"
        fi
      done

      parallel --tag --line-buffered cargo zigbuild --release --target {} --lib ::: "${targets[@]}"

      cache_upload $cross_compile_artifact target/x86_64-apple-darwin/release/libavm_transpiler.a target/aarch64-apple-darwin/release/libavm_transpiler.a
    fi
  fi
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full"|"ci")
    build
    ;;
  "test")
    echo "No tests."
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
