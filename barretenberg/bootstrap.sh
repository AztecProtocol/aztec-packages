#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

function bootstrap_all {
  # To run bb we need a crs.
  # Download ignition up front to ensure no race conditions at runtime.
  [ -n "${SKIP_BB_CRS:-}" ] || ./scripts/download_bb_crs.sh
  ./bbup/bootstrap.sh $@
  ./cpp/bootstrap.sh $@
  ./ts/bootstrap.sh $@
  ./acir_tests/bootstrap.sh $@
}

function hash {
  cache_content_hash "^barretenberg"
}

function bench {
  rm -rf bench-out && mkdir -p bench-out
  local hash=$(hash)
  if cache_download barretenberg-bench-results-$hash.tar.gz; then
    return
  fi
  bootstrap_all bench
  ./scripts/combine_benchmarks.py \
    ./cpp/bench-out/*.json \
    ./acir_tests/bench-out/*.txt \
    > ./bench-out/bb-bench.json
  cache_upload barretenberg-bench-results-$hash.tar.gz ./bench-out/bb-bench.json
}

cmd=${1:-}
[ -n "$cmd" ] && shift

case "$cmd" in
  hash)
    hash
    ;;
  ""|clean|ci|fast|test|test_cmds|release)
    bootstrap_all $cmd $@
    ;;
  bench)
    bench
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
