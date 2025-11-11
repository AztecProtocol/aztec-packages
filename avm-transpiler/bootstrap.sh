#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(hash_str $(../noir/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))

export GIT_COMMIT="$(cat ../noir/noir-repo-ref | head -n1)-aztec"
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS="-Dwarnings"

# Generate Cargo.toml from template based on noir-repo-ref
function generate_cargo_toml {
  local ref_content=$(head -n 1 ../noir/noir-repo-ref)
  local noir_git_url
  local noir_ref_type
  local noir_ref_value

  # Detect if noir-repo-ref contains a URL (has ://) or is a simple tag/version
  if [[ "$ref_content" == *"://"* ]]; then
    # Unhappy path: Custom repository URL
    if [[ "$ref_content" == *"#"* ]]; then
      noir_git_url="${ref_content%#*}"
      noir_ref_value="${ref_content##*#}"
      # Determine if it's a branch or commit hash
      if [[ "$noir_ref_value" =~ ^[0-9a-f]{40}$ ]]; then
        noir_ref_type="rev"
      else
        noir_ref_type="branch"
      fi
    else
      noir_git_url="$ref_content"
      noir_ref_type="branch"
      noir_ref_value="master"
    fi
  else
    # Happy path: Official release tag
    noir_git_url="https://github.com/noir-lang/noir"
    noir_ref_type="tag"
    noir_ref_value="$ref_content"
  fi

  echo "Generating Cargo.toml from template..."
  echo "  Git URL: $noir_git_url"
  echo "  Ref type: $noir_ref_type"
  echo "  Ref value: $noir_ref_value"

  # Generate Cargo.toml from template using sed
  sed -e "s|{{NOIR_GIT_URL}}|$noir_git_url|g" \
      -e "s|{{NOIR_REF_TYPE}}|$noir_ref_type|g" \
      -e "s|{{NOIR_REF_VALUE}}|$noir_ref_value|g" \
      Cargo.toml.template > Cargo.toml
}

function build_native {
  echo_header "avm-transpiler build_native"

  # Generate Cargo.toml from template before building
  generate_cargo_toml

  artifact=avm-transpiler-$hash.tar.gz
  if ! cache_download $artifact; then
    # Serialize cargo/rustup operations to avoid race conditions when running parallel builds
    # Cargo may trigger rustup to install components (rust-src, etc.) in shared directories
    (
      flock -x 200
      denoise "cargo build --release --locked --bin avm-transpiler"
      denoise "cargo build --release --locked --lib"
    ) 200>/tmp/rustup-avm-transpiler.lock

    denoise "cargo fmt --check"
    denoise "cargo clippy"
    cache_upload $artifact target/release/avm-transpiler target/release/libavm_transpiler.a
  fi
}

function build_cross {
  local target=$1
  echo_header "avm-transpiler build_cross $target"

  # Generate Cargo.toml from template before building
  generate_cargo_toml

  cross_compile_artifact=avm-transpiler-cross-$target-$hash.tar.gz
  if ! cache_download $cross_compile_artifact; then
    # We build libraries to be linked by barretenberg
    # For now we only use the zig build for macOS targets

    # Determine rust target outside of subshell
    local rust_target
    case "$target" in
      amd64-macos)
        rust_target=x86_64-apple-darwin
        ;;
      arm64-macos)
        rust_target=aarch64-apple-darwin
        ;;
      *)
        echo_stderr "Unknown target: $target"
        exit 1
        ;;
    esac

    # Serialize rustup operations to avoid race conditions when running parallel builds
    (
      flock -x 200
      if ! command -v cargo-zigbuild >/dev/null 2>&1; then
        cargo install --locked cargo-zigbuild
      fi

      if ! rustup target list --installed | grep -q "^$rust_target$"; then
        echo "Installing Rust target: $rust_target"
        rustup target add "$rust_target"
      fi
    ) 200>/tmp/rustup-avm-transpiler.lock

    cargo zigbuild --release --target "$rust_target" --lib

    cache_upload $cross_compile_artifact target/$rust_target/release/libavm_transpiler.a
  fi
}

function build {
  build_native
  if [ "$CI_FULL" -eq 1 ]; then
    build_cross amd64-macos
    build_cross arm64-macos
  fi
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full"|"ci")
    build
    ;;
  build_native)
    build_native
    ;;
  build_cross)
    shift
    build_cross "$@"
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
