#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

hash=$(../bootstrap.sh hash)

function bench {
  mkdir -p bench-out

  for config in ./testbench/configurations/*.json; do
    config_name=${config##*/}
    ./testbench/run_testbench.sh $config_name ./bench-out/$config_name
  done

  ./testbench/consolidate_benchmarks.sh

  cache_upload yarn-project-p2p-bench-results-$COMMIT_HASH.tar.gz ./bench-out/consolidated.json
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
