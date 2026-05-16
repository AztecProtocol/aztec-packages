#!/usr/bin/env bash
if [ "${1:-}" = "hash" ] && [ "${NO_CACHE:-0}" -eq 1 ] && [ "${NO_CACHE_UPLOAD:-0}" -eq 1 ]; then
  echo disabled-cache
  exit 0
fi

script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
root=${root:-$(cd "$script_dir/../.." && pwd)}
source "$root/ci3/source_bootstrap"

function get_hash {
  cache_content_hash .rebuild_patterns
}

# Print every individual test command. Can be fed into gnu parallel.
# Paths are relative to repo root.
# We append the hash as a comment. This ensures the test harness and cache and skip future runs.
function test_cmds {
  local hash
  if [ "${NO_CACHE:-0}" -eq 1 ]; then
    hash=disabled-cache
  else
    hash=$(get_hash)
  fi

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
    get_hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
