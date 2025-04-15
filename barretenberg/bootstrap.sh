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
  fast-bootstrap)
    echo "WARNING: This assumes you have only changed barretenberg and the rest of the repository is unchanged."
    echo "WARNING: It builds only up until yarn-project."
    merge_base=$(git merge-base HEAD origin/master)
    AZTEC_CACHE_COMMIT=$MERGE_BASE noir/bootstrap.sh
    ./bootstrap.sh
    AZTEC_CACHE_COMMIT=$MERGE_BASE avm-transpiler/bootstrap.sh
    AZTEC_CACHE_COMMIT=$MERGE_BASE noir-projects/bootstrap.sh
    AZTEC_CACHE_COMMIT=$MERGE_BASE l1-contracts/bootstrap.sh
    AZTEC_CACHE_COMMIT=$MERGE_BASE yarn-project/bootstrap.sh
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
