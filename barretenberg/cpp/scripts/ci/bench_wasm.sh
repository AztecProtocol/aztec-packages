#!/usr/bin/env sh
[ -n "${BUILD_SYSTEM_DEBUG:-}" ] && set -x # conditionally trace
set -eu

# enter script folder
cd "$(dirname $0)"

cd ../../srs_db
cd ../build

bench() {
  ~/.wasmtime/bin/wasmtime run -Wthreads=y -Sthreads=y --dir=.. ./bin/$1 --benchmark_format=json --benchmark_counters_tabular=true $2 > $1.json
  cat $1.json
}

bench ultra_honk_bench --benchmark_filter=construct_proof_ultrahonk_power_of_2/20
bench goblin_ultra_honk_bench --benchmark_filter=construct_proof_goblinultrahonk_power_of_2/20
bench ivc_bench --benchmark_filter=IvcBench/Full/2