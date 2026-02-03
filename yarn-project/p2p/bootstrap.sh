#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(../bootstrap.sh hash)

function bench {
  mkdir -p bench-out

  bench_allowed_configs=("degree-1-strict.json" "normal-degree-100-nodes.json")

  for config in "${bench_allowed_configs[@]}"; do
    ./testbench/run_testbench.sh $config ./bench-out/$config
  done
  ./testbench/consolidate_benchmarks.sh
}

case "$cmd" in
  bench)
    bench > /dev/null
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
