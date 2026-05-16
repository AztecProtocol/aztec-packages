#!/usr/bin/env bash
script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
root=${root:-$(cd "$script_dir/.." && pwd)}
source "$root/ci3/source_bootstrap"

function get_hash {
  cache_content_hash ^ci3
}

function test_cmds {
  local hash
  if [ "${NO_CACHE:-0}" -eq 1 ]; then
    hash=disabled-cache
  else
    hash=$(get_hash)
  fi

  for f in tests/*; do
    echo "$hash ./ci3/$f"
  done
  echo "$hash ./ci3/semver test"
}

function test {
  echo_header "ci3 tests"
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "")
    test
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
