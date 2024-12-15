#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

function build {
  github_group "avm-transpiler build"
  artifact=avm-transpiler-$(cache_content_hash ../noir/.rebuild_patterns_native .rebuild_patterns).tar.gz
  if ! cache_download $artifact; then
    denoise ./scripts/bootstrap_native.sh
    cache_upload $artifact target/release
  fi
  github_endgroup
}

function test {
  cargo fmt --check
  cargo clippy
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    test
    ;;
  "ci")
    build
    test
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac