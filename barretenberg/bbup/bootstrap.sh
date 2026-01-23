#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

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
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "hash")
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
