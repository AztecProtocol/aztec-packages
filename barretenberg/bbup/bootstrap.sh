#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

export hash=$(cache_content_hash .rebuild_patterns)

# Print every individual test command. Can be fed into gnu parallel.
# Paths are relative to repo root.
# We append the hash as a comment. This ensures the test harness and cache and skip future runs.
function test_cmds {
  if [ $(arch) == "amd64" ]; then
    echo -e "$hash barretenberg/bbup/run_test.sh 0.72.1"
  fi
  echo -e "$hash barretenberg/bbup/run_test.sh 0.77.1"
}

# This is not called in ci. It is just for a developer to run the tests.
function test {
  echo_header "bbup test"
  test_cmds | filter_test_cmds | parallelise
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|fast|full|bench|bench_cmds)
    ;;
  "ci")
    test
    ;;
  "hash")
    echo $hash
    ;;
  test|test_cmds)
    $cmd "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
