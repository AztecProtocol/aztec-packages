#!/usr/bin/env bash
script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
root=${root:-$(cd "$script_dir/../.." && pwd)}
source "$root/ci3/source_bootstrap"

repo_root=$root
export NARGO=${NARGO:-$repo_root/noir/noir-repo/target/release/nargo}
export BB=${BB:-$repo_root/barretenberg/cpp/build/bin/bb}
export PROFILER_PATH=${PROFILER_PATH:-$repo_root/noir/noir-repo/target/release/noir-profiler}

if [ "${NO_CACHE:-0}" -eq 1 ]; then
  hash=disabled-cache
else
  hash=$(../bootstrap.sh hash)
fi

function test_cmds {
  # All CLI tests share test/mixed-workspace/target so they must run sequentially
  # in a single jest invocation (--runInBand is set by run_test.sh).
  echo "$hash:ISOLATE=1:NAME=aztec/cli NARGO=$NARGO BB=$BB PROFILER_PATH=$PROFILER_PATH yarn-project/scripts/run_test.sh aztec/src/cli"
}

case "$cmd" in
  "")
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
