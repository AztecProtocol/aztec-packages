#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

repo_root=$(git rev-parse --show-toplevel)
export NARGO=${NARGO:-$repo_root/noir/noir-repo/target/release/nargo}
export BB=${BB:-$repo_root/barretenberg/cpp/build/bin/bb}

hash=$(../bootstrap.sh hash)

function test_cmds {
  echo "$hash:ISOLATE=1:NAME=aztec/src/cli/cmds/compile.test.ts NARGO=$NARGO BB=$BB yarn-project/scripts/run_test.sh aztec/src/cli/cmds/compile.test.ts"
}

case "$cmd" in
  "")
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
