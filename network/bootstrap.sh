#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(cache_content_hash .rebuild_patterns)

function build {
  yarn install
  yarn typecheck
  yarn formatting
}

function test_cmds {
  echo "$hash node --experimental-strip-types --test tests/deploy.test.ts"
}

case "$cmd" in
  ""|"fast"|"full")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  "test_cmds")
    test_cmds
    ;;
  "deploy")
    shift
    node --experimental-strip-types main.ts deploy "$@"
    ;;
  "teardown")
    shift
    node --experimental-strip-types main.ts teardown "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
    ;;
esac
