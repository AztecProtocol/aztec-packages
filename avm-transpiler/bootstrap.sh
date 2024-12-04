#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/source

cmd=${1:-}

function build {
  github_group "avm-transpiler build"
  artifact=avm-transpiler-$(cache_content_hash ../noir/.rebuild_patterns_native .rebuild_patterns).tar.gz
  if ! cache_download $artifact; then
    ./scripts/bootstrap_native.sh
    cache_upload $artifact target
  fi
  github_endgroup
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
    build
    ;;
  "test")
    ;;
  "ci")
    build
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac