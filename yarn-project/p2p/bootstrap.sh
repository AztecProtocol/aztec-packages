#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(../bootstrap.sh hash)

function bench {
  mkdir -p bench-out
  ./testbench/run_testbench.sh degree-1-strict.json ./bench-out/p2p-bench.json
  cache_upload yarn-project-p2p-bench-results-$COMMIT_HASH.tar.gz ./bench-out/p2p-bench.json
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  bench)
    $cmd
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
