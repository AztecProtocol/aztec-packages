#!/usr/bin/env bash
script_dir=${BASH_SOURCE[0]%/*}
[ "$script_dir" = "${BASH_SOURCE[0]}" ] && script_dir=.
case "$script_dir" in
  /*) root=${root:-$script_dir/../..} ;;
  *) root=${root:-$PWD/$script_dir/../..} ;;
esac
source "$root/ci3/source_bootstrap"

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
