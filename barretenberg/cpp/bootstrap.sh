#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

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
}

function build_world_state_napi {
  set -eu
  (cd src/barretenberg/world_state_napi && yarn --frozen-lockfile --prefer-offline)
  if ! cache_download barretenberg-release-world-state-$hash.tar.gz; then
    rm -f build-pic/CMakeCache.txt
    cmake --preset $pic_preset -DCMAKE_BUILD_TYPE=RelWithAssert
    cmake --build --preset $pic_preset --target world_state_napi
    cache_upload barretenberg-release-world-state-$hash.tar.gz build-pic/lib/world_state_napi.node
  fi
}

function build_darwin {
  local arch=${1:-$(arch)}
  if ! cache_download barretenberg-darwin-$hash.tar.gz; then
    # Download sdk.
    local osx_sdk="MacOSX14.0.sdk"
    if ! [ -d "/opt/osxcross/SDK/$osx_sdk" ]; then
      echo "Downloading $osx_sdk..."
      local osx_sdk_url="https://github.com/joseluisq/macosx-sdks/releases/download/14.0/${osx_sdk}.tar.xz"
      curl -sSL "$osx_sdk_url" | sudo tar -xJ -C /opt/osxcross/SDK && sudo rm -rf /opt/osxcross/SDK/$osx_sdk/System
    fi

    rm -f build-darwin-$arch/CMakeCache.txt
    cmake --preset darwin-$arch && cmake --build --preset darwin-$arch --target bb
    cache_upload barretenberg-darwin-$hash.tar.gz build-darwin-$arch/bin
  fi
}

# Build single threaded wasm. Needed when no shared mem available.
function build_wasm {
  set -eu
  if ! cache_download barretenberg-wasm-$hash.tar.gz; then
    rm -f build-wasm/CMakeCache.txt
    cmake --preset wasm && cmake --build --preset wasm
    cache_upload barretenberg-wasm-$hash.tar.gz build-wasm/bin
  fi
}

# Build GCC - but only syntax check.
# Note we do miss some deeper GCC checks this way, but they were as noisy
# as they were useful historically, and we have sanitizers.
function build_gcc_syntax_check_only {
  set -eu
  if cache_download barretenberg-gcc-$hash.tar.gz; then
    return
  fi
  cmake --preset gcc -DSYNTAX_ONLY=1
  cmake --build --preset gcc
  # Note: There's no real artifact here, we fake one for consistency.
  echo success > build-gcc/syntax-check-success.flag
  cache_upload barretenberg-gcc-$hash.tar.gz build-gcc/syntax-check-success.flag
}

# Build multi-threaded wasm. Requires shared memory.
function build_wasm_threads {
  set -eu
  if ! cache_download barretenberg-wasm-threads-$hash.tar.gz; then
    rm -f build-wasm-threads/CMakeCache.txt
    cmake --preset wasm-threads && cmake --build --preset wasm-threads
    cache_upload barretenberg-wasm-threads-$hash.tar.gz build-wasm-threads/bin
  fi
}

# Download ignition transcripts. Only needed for tests.
# The actual bb binary uses the flat crs downloaded in barratenberg/bootstrap.sh to ~/.bb-crs.
# TODO: Use the flattened crs. These old transcripts are a pain. Delete this.
function download_old_crs {
  cd ./srs_db && ./download_ignition.sh 3 && ./download_grumpkin.sh
}

function build_release {
  rm -rf build-release
  mkdir build-release
  local arch=$(arch)
  tar -czf build-release/barretenberg-$arch-linux.tar.gz -C build/bin bb
  tar -czf build-release/barretenberg-$arch-darwin.tar.gz -C build-darwin-$arch/bin bb
  tar -czf build-release/barretenberg-wasm.tar.gz -C build-wasm/bin barretenberg.wasm
  tar -czf build-release/barretenberg-debug-wasm.tar.gz -C build-wasm/bin barretenberg-debug.wasm
  tar -czf build-release/barretenberg-threads-wasm.tar.gz -C build-wasm-threads/bin barretenberg.wasm
  tar -czf build-release/barretenberg-threads-debug-wasm.tar.gz -C build-wasm-threads/bin barretenberg-debug.wasm
}

export -f build_native build_darwin build_world_state_napi build_wasm build_wasm_threads build_gcc_syntax_check_only download_old_crs

function build {
  echo_header "bb cpp build"
  builds=(
    build_native
    build_world_state_napi
    build_wasm
    build_wasm_threads
    download_old_crs
  )
  if [ "$REF_NAME" == "master" ]; then
    builds+=(
      build_gcc_syntax_check_only
      build_darwin
    )
  fi
  parallel --line-buffered --tag denoise {} ::: ${builds[@]}
  build_release
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
    parallel --line-buffered --tag -v "denoise \
      'cmake --preset {} && cmake --build --preset {} --target ultra_honk_bench --target client_ivc_bench'" ::: \
      clang16-assert wasm-threads op-count op-count-time
    cache_upload barretenberg-benchmarks-$hash.tar.gz \
      {build,build-wasm-threads,build-op-count,build-op-count-time}/bin/{ultra_honk_bench,client_ivc_bench}
  fi
}

# Runs benchmarks sharded over machine cores.
function bench {
  echo_header "bb bench"
  build_benchmarks

  export HARDWARE_CONCURRENCY=16
  export IGNITION_CRS_PATH=./srs_db/ignition
  export GRUMPKIN_CRS_PATH=./srs_db/grumpkin

  rm -rf bench-out && mkdir -p bench-out

  # Ultra honk.
  function ultra_honk_release {
    ./build/bin/ultra_honk_bench \
      --benchmark_out=./bench-out/ultra_honk_release.json \
      --benchmark_filter="construct_proof_ultrahonk_power_of_2/20$"
  }
  function ultra_honk_wasm {
    wasmtime run --env HARDWARE_CONCURRENCY --env IGNITION_CRS_PATH --env GRUMPKIN_CRS_PATH -Wthreads=y -Sthreads=y --dir=. \
      ./build-wasm-threads/bin/ultra_honk_bench \
        --benchmark_out=./bench-out/ultra_honk_wasm.json \
        --benchmark_filter="construct_proof_ultrahonk_power_of_2/20$"
  }

  # Client IVC
  function client_ivc_17_in_20_release {
    ./build/bin/client_ivc_bench \
      --benchmark_out=./bench-out/client_ivc_17_in_20_release.json \
      --benchmark_filter="ClientIVCBench/Ambient_17_in_20/6$"
  }
  function client_ivc_release {
    ./build/bin/client_ivc_bench \
      --benchmark_out=./bench-out/client_ivc_release.json \
      --benchmark_filter="ClientIVCBench/Full/6$"
  }
  function client_ivc_op_count {
    ./build-op-count/bin/client_ivc_bench \
      --benchmark_out=./bench-out/client_ivc_op_count.json \
      --benchmark_filter="ClientIVCBench/Full/6$"
  }
  function client_ivc_op_count_time {
    ./build-op-count-time/bin/client_ivc_bench \
      --benchmark_out=./bench-out/client_ivc_op_count_time.json \
      --benchmark_filter="ClientIVCBench/Full/6$"
  }
  function client_ivc_wasm {
    wasmtime run --env HARDWARE_CONCURRENCY --env IGNITION_CRS_PATH --env GRUMPKIN_CRS_PATH -Wthreads=y -Sthreads=y --dir=. \
      ./build-wasm-threads/bin/client_ivc_bench \
        --benchmark_out=./bench-out/client_ivc_wasm.json \
        --benchmark_filter="ClientIVCBench/Full/6$"
  }
  function run_benchmark {
    local start_core=$(( ($1 - 1) * HARDWARE_CONCURRENCY ))
    local end_core=$(( start_core + (HARDWARE_CONCURRENCY - 1) ))
    echo taskset -c $start_core-$end_core bash -c "$2"
    taskset -c $start_core-$end_core bash -c "$2"
  }

  export -f ultra_honk_release ultra_honk_wasm client_ivc_17_in_20_release client_ivc_release client_ivc_op_count client_ivc_op_count_time client_ivc_wasm run_benchmark

  local num_cpus=$(get_num_cpus)
  local jobs=$((num_cpus / HARDWARE_CONCURRENCY))

  parallel -v --line-buffer --tag --jobs "$jobs" run_benchmark {#} {} ::: \
    ultra_honk_release \
    ultra_honk_wasm \
    client_ivc_17_in_20_release \
    client_ivc_release \
    client_ivc_op_count \
    client_ivc_op_count_time \
    client_ivc_wasm

  ./scripts/ci/combine_benchmarks.py \
    native ./bench-out/client_ivc_17_in_20_release.json \
    native ./bench-out/client_ivc_release.json \
    native ./bench-out/ultra_honk_release.json \
    wasm ./bench-out/client_ivc_wasm.json \
    wasm ./bench-out/ultra_honk_wasm.json \
    "" ./bench-out/client_ivc_op_count.json \
    "" ./bench-out/client_ivc_op_count_time.json \
    > ./bench-out/bench.json

    cache_upload barretenberg-bench-results-$COMMIT_HASH.tar.gz ./bench-out/bench.json
}

# Upload assets to release.
function release {
  echo_header "bb cpp release"
  gh release upload $REF_NAME build-release/* --clobber
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
  bench|release|build_native|build_wasm|build_wasm_threads|build_darwin|build_release)
    $cmd $@
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
