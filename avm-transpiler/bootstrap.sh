#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash ../noir/.rebuild_patterns .rebuild_patterns)

function build {
  github_group "avm-transpiler build"
  if ! cache_download avm-transpiler $hash; then
    denoise ./scripts/bootstrap_native.sh
    cache_upload avm-transpiler $hash target/release
  fi
  github_endgroup
}

function test {
  denoise cargo fmt --check
  denoise cargo clippy
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
  "hash")
    echo $hash
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac