#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

# To run bb we need a crs.
# Download ignition up front to ensure no race conditions at runtime.
[ -n "${SKIP_BB_CRS:-}" ] || ./scripts/download_bb_crs.sh

function bootstrap_all {
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
  hash=$(hash)
  if cache_download barretenberg-bench-results-$hash.tar.gz; then
    return
  fi
  # bootstrap_all bench
  ./scripts/combine_benchmarks.py \
    native ./cpp/bench-out/client_ivc_17_in_20_release.json \
    native ./cpp/bench-out/client_ivc_release.json \
    native ./cpp/bench-out/ultra_honk_release.json \
    wasm ./cpp/bench-out/client_ivc_wasm.json \
    wasm ./cpp/bench-out/ultra_honk_wasm.json \
    "" ./cpp/bench-out/client_ivc_op_count.json \
    "" ./cpp/bench-out/client_ivc_op_count_time.json \
    wasm ./acir_tests/bench-out/ultra_honk_rec_wasm_memory.txt \
    > ./bench-out/bb-bench.json
  # For some reason the above script doesn't set the exit code correctly
  # so we need to check the output file.
  if [ ! -f ./bench-out/bb-bench.json ]; then
    echo "Failed to create benchmark file"
    exit 1
  fi
  cache_upload barretenberg-bench-results-$hash.tar.gz ./bench-out/bb-bench.json
}

cmd=${1:-}
[ -n "$cmd" ] && shift

case "$cmd" in
  hash)
    hash
    ;;
  ""|clean|ci|fast|test|test_mds|release)
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
