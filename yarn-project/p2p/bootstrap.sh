#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(../bootstrap.sh hash)

function bench {
  mkdir -p bench-out

  bench_allowed_configs=("degree-1-strict.json" "normal-degree-100-nodes.json")

  for config in "${bench_allowed_configs[@]}"; do
    ./testbench/run_testbench.sh $config ./bench-out/$config
  done
  ./testbench/consolidate_benchmarks.sh

  cache_upload yarn-project-p2p-bench-results-$COMMIT_HASH.tar.gz ./bench-out/p2p-bench.json
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  bench)
    $cmd > /dev/null
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
