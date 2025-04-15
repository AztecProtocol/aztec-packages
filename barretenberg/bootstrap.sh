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
  bootstrap_e2e_hack)
    echo "WARNING: This assumes your PR only changes barretenberg and the rest of the repository is unchanged from master."
    echo "WARNING: This is only sound if you have not changed VK generation! (or noir-projects VKs will be incorrect)."
    echo "WARNING: It builds up until yarn-project and allows end-to-end tests (not boxes/playground/release image etc)."
    merge_base=$(git merge-base HEAD origin/master)
    for project in noir barretenberg avm-transpiler noir-projects l1-contracts yarn-project ; do
      if [ $project == barretenberg ]; then
        ../$project/bootstrap.sh # i.e. this script
      else
        AZTEC_CACHE_COMMIT=$merge_base ../$project/bootstrap.sh
      fi
    done
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
  ;;
esac
