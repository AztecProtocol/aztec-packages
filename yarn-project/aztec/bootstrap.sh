#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

repo_root=$(git rev-parse --show-toplevel)
export NARGO=${NARGO:-$repo_root/noir/noir-repo/target/release/nargo}
export BB=${BB:-$repo_root/barretenberg/cpp/build/bin/bb}
export PROFILER_PATH=${PROFILER_PATH:-$repo_root/noir/noir-repo/target/release/noir-profiler}

hash=$(../bootstrap.sh hash)

function test_cmds {
  # All CLI tests share test/mixed-workspace/target so they must run sequentially
  # in a single jest invocation (--runInBand is set by run_test.sh).
  echo "$hash:ISOLATE=1:NAME=aztec/cli NARGO=$NARGO BB=$BB PROFILER_PATH=$PROFILER_PATH yarn-project/scripts/run_test.sh aztec/src/cli"
  # setupLocalNetwork smoke test: spins up anvil + an in-process node (network usage ⇒ ISOLATE).
  echo "$hash:ISOLATE=1:NAME=aztec/testing yarn-project/scripts/run_test.sh aztec/src/testing/local-network.test.ts"
  echo "$hash yarn-project/scripts/run_test.sh aztec/src/deploy/graph.test.ts"
}

case "$cmd" in
  "")
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
