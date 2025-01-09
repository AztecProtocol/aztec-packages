#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

export preset=clang16-assert
export pic_preset="clang16-pic"
export hash=$(cache_content_hash .rebuild_patterns)

# Build all native binaries, including tests.
function build_native {
  set -eu
  if ! cache_download barretenberg-release-$hash.tar.gz; then
    ./format.sh check
    rm -f build/CMakeCache.txt
    cmake --preset $preset
    cmake --build --preset $preset
    cache_upload barretenberg-release-$hash.tar.gz build/bin
  fi

  (cd src/barretenberg/world_state_napi && yarn --frozen-lockfile --prefer-offline)
  if ! cache_download barretenberg-release-world-state-$hash.tar.gz; then
    rm -f build-pic/CMakeCache.txt
    cmake --preset $pic_preset -DCMAKE_BUILD_TYPE=RelWithAssert
    cmake --build --preset $pic_preset --target world_state_napi
    cache_upload barretenberg-release-world-state-$hash.tar.gz build-pic/lib/world_state_napi.node
  fi
}

# Build single threaded wasm. Needed when no shared mem available.
function build_wasm {
  set -eu
  if ! cache_download barretenberg-wasm-$hash.tar.gz; then
    rm -f build-wasm/CMakeCache.txt
    cmake --preset wasm
    cmake --build --preset wasm
    /opt/wasi-sdk/bin/llvm-strip ./build-wasm/bin/barretenberg.wasm
    cache_upload barretenberg-wasm-$hash.tar.gz build-wasm/bin
  fi
  (cd ./build-wasm/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
}

# Build multi-threaded wasm. Requires shared memory.
function build_wasm_threads {
  set -eu
  if ! cache_download barretenberg-wasm-threads-$hash.tar.gz; then
    rm -f build-wasm-threads/CMakeCache.txt
    cmake --preset wasm-threads
    cmake --build --preset wasm-threads
    /opt/wasi-sdk/bin/llvm-strip ./build-wasm-threads/bin/barretenberg.wasm
    cache_upload barretenberg-wasm-threads-$hash.tar.gz build-wasm-threads/bin
  fi
  (cd ./build-wasm-threads/bin && gzip barretenberg.wasm -c > barretenberg.wasm.gz)
}

# Download ignition transcripts. Only needed for tests.
# The actual bb binary uses the flat crs downloaded in barratenberg/bootstrap.sh to ~/.bb-crs.
# TODO: Use the flattened crs. These old transcripts are a pain. Delete this.
function download_old_crs {
  cd ./srs_db && ./download_ignition.sh 3 && ./download_grumpkin.sh
}

export -f build_native build_wasm build_wasm_threads download_old_crs

function build {
  echo_header "bb cpp build"
  parallel --line-buffered --tag denoise {} ::: build_native build_wasm build_wasm_threads download_old_crs
}

# Print every individual test command. Can be fed into gnu parallel.
# Paths are relative to repo root.
# We append the hash as a comment. This ensures the test harness and cache and skip future runs.
function test_cmds {
  cd build
  for bin in ./bin/*_tests; do
    bin_name=$(basename $bin)
    $bin --gtest_list_tests | \
      awk '/^[a-zA-Z]/ {suite=$1} /^[ ]/ {print suite$1}' | \
      grep -v 'DISABLED_' | \
      while read -r test; do
        echo -e "$hash barretenberg/cpp/scripts/run_test.sh $bin_name $test"
      done
  done
}

# This is not called in ci. It is just for a developer to run the tests.
function test {
  echo_header "bb test"
  test_cmds | filter_test_cmds | parallelise
}

function build_benchmarks {
  set -eu
  if ! cache_download barretenberg-benchmarks-$hash.tar.gz; then
    parallel --line-buffered --tag denoise \
      "cmake --preset {} && cmake --build --preset {} --target ultra_honk_bench --target client_ivc_bench" ::: \
      clang16-assert wasm-threads op-count op-count-time
    cache_upload barretenberg-benchmarks-$hash.tar.gz \
      {build,build-wasm-threads,build-op-count,build-op-count-time}/bin/{ultra_honk_bench,client_ivc_bench}
  fi
}

function benchmark {
  build_benchmarks

  export HARDWARE_CONCURRENCY=16
  export IGNITION_CRS_PATH=./srs_db/ignition
  export GRUMPKIN_CRS_PATH=./srs_db/grumpkin

  mkdir -p bench-out

  # Ultra honk.
  ./build/bin/ultra_honk_bench \
    --benchmark_out=./bench-out/ultra_honk_release.json \
    --benchmark_filter="construct_proof_ultrahonk_power_of_2/20$"
  wasmtime run --env HARDWARE_CONCURRENCY --env IGNITION_CRS_PATH --env GRUMPKIN_CRS_PATH -Wthreads=y -Sthreads=y --dir=. \
    ./build-wasm-threads/bin/ultra_honk_bench \
      --benchmark_out=./bench-out/ultra_honk_wasm.json \
      --benchmark_filter="construct_proof_ultrahonk_power_of_2/20$"

  # Client IVC
  ./build/bin/client_ivc_bench \
    --benchmark_out=./bench-out/client_ivc_17_in_20_release.json \
    --benchmark_filter="ClientIVCBench/Ambient_17_in_20/6$"
  ./build/bin/client_ivc_bench \
    --benchmark_out=./bench-out/client_ivc_release.json \
    --benchmark_filter="ClientIVCBench/Full/6$"
   ./build-op-count/bin/client_ivc_bench \
    --benchmark_out=./bench-out/client_ivc_op_count.json \
    --benchmark_filter="ClientIVCBench/Full/6$"
   ./build-op-count-time/bin/client_ivc_bench \
    --benchmark_out=./bench-out/client_ivc_op_count_time.json \
    --benchmark_filter="ClientIVCBench/Full/6$"
  wasmtime run --env HARDWARE_CONCURRENCY --env IGNITION_CRS_PATH --env GRUMPKIN_CRS_PATH -Wthreads=y -Sthreads=y --dir=. \
    ./build-wasm-threads/bin/client_ivc_bench \
      --benchmark_out=./bench-out/client_ivc_wasm.json \
      --benchmark_filter="ClientIVCBench/Full/6$"

  ./scripts/ci/combine_benchmarks.py \
    native ./bench-out/client_ivc_17_in_20_release.json \
    native ./bench-out/client_ivc_release.json \
    native ./bench-out/ultra_honk_release.json \
    wasm ./bench-out/client_ivc_wasm.json \
    wasm ./bench-out/ultra_honk_wasm.json \
    "" ./bench-out/client_ivc_op_count.json \
    "" ./bench-out/client_ivc_op_count_time.json \
    > ./bench-out/bench.json
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast")
    # Build bb and wasms. Can be incremental.
    build
    ;;
  "full")
    # Deletes all build dirs and build bb and wasms from scratch.
    rm -rf build*
    build
    ;;
  "test")
    test
    ;;
  "ci")
    build
    test
    ;;
  "hash")
    echo $hash
    ;;
  "test-cmds")
    test_cmds
    ;;
  "bench")
    benchmark
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac