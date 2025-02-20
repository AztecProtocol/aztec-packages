#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

# To run bb we need a crs.
# Download ignition up front to ensure no race conditions at runtime.
[ -n "${SKIP_BB_CRS:-}" ] || ./scripts/download_bb_crs.sh

./cpp/bootstrap.sh $@
./ts/bootstrap.sh $@
./acir_tests/bootstrap.sh $@

cmd=${1:-}
if [ $cmd == "bench" ]; then
    rm -rf bench-out && mkdir -p bench-out
    ./scripts/combine_benchmarks.py \
    native ./cpp/bench-out/client_ivc_17_in_20_release.json \
    native ./cpp/bench-out/client_ivc_release.json \
    native ./cpp/bench-out/ultra_honk_release.json \
    wasm ./cpp/bench-out/client_ivc_wasm.json \
    wasm ./cpp/bench-out/ultra_honk_wasm.json \
    "" ./cpp/bench-out/client_ivc_op_count.json \
    "" ./cpp/bench-out/client_ivc_op_count_time.json \
    wasm ./acir_tests/bench-out/ultra_honk_wasm_memory.txt \
    > ./bench-out/bb-bench.json

  cache_upload barretenberg-bench-results-$COMMIT_HASH.tar.gz ./bench-out/bb-bench.json
fi 