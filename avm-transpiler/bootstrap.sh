#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash ../noir/.rebuild_patterns .rebuild_patterns)

export GIT_COMMIT="0000000000000000000000000000000000000000"
export SOURCE_DATE_EPOCH=0
export GIT_DIRTY=false
export RUSTFLAGS="-Dwarnings"

function build {
  echo_header "avm-transpiler build"
  artifact=avm-transpiler-$hash.tar.gz
  if ! cache_download $artifact; then
    denoise "cargo build --release"
    denoise "cargo fmt --check"
    denoise "cargo clippy"
    cache_upload $artifact target/release
  fi
}

function test_cmds {
  echo "$hash cd avm-transpiler && cargo fmt --check"
  echo "$hash cd avm-transpiler && cargo clippy"
}

function test {
  echo_header "avm-transpiler test"
  test_cmds | filter_test_cmds | parallelise
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full"|"ci")
    build
    ;;
  "test")
    test
    ;;
  "test-cmds")
    test_cmds
    ;;
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
