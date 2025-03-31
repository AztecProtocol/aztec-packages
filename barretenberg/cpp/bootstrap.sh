#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

export preset=clang16-assert
export pic_preset="clang16-pic"
export hash=$(cache_content_hash .rebuild_patterns)

# Injects version number into a given bb binary.
# Means we don't actually need to rebuild bb to release a new version if code hasn't changed.
function inject_version {
  local binary=$1
  local version=$(jq -r '."."' ../../.release-please-manifest.json)
  local placeholder='00000000.00000000.00000000'
  if [ ${#version} -gt ${#placeholder} ]; then
    echo "Error: version ($version) is longer than placeholder. Cannot update bb binaries."
    exit 1
  fi
  local offset=$(grep -aobF "$placeholder" $binary | head -n 1 | cut -d: -f1)
  if [ -z "$offset" ]; then
    echo "Placeholder not found in $binary, can't inject version."
    exit 1
  fi
  printf "$version\0" | dd of=$binary bs=1 seek=$offset conv=notrunc 2>/dev/null
}

# Build all native binaries, including tests.
function build_native {
  set -eu
  if ! cache_download barretenberg-release-$hash.zst; then
    ./format.sh check
    rm -f build/CMakeCache.txt
    cmake --preset $preset
    cmake --build --preset $preset
    cache_upload barretenberg-release-$hash.zst build/bin
  fi
}

function build_nodejs_module {
  set -eu
  (cd src/barretenberg/nodejs_module && yarn --frozen-lockfile --prefer-offline)
  if ! cache_download barretenberg-release-nodejs-module-$hash.zst; then
    rm -f build-pic/CMakeCache.txt
    cmake --preset $pic_preset -DCMAKE_BUILD_TYPE=RelWithAssert
    cmake --build --preset $pic_preset --target nodejs_module
    cache_upload barretenberg-release-nodejs-module-$hash.zst build-pic/lib/nodejs_module.node
  fi
}

function build_darwin {
  set -eu
  local arch=${1:-$(arch)}
  if ! cache_download barretenberg-darwin-$hash.zst; then
    # Download sdk.
    local osx_sdk="MacOSX14.0.sdk"
    if ! [ -d "/opt/osxcross/SDK/$osx_sdk" ]; then
      echo "Downloading $osx_sdk..."
      local osx_sdk_url="https://github.com/joseluisq/macosx-sdks/releases/download/14.0/${osx_sdk}.tar.xz"
      curl -sSL "$osx_sdk_url" | sudo tar -xJ -C /opt/osxcross/SDK
      sudo rm -rf /opt/osxcross/SDK/$osx_sdk/System
    fi

    rm -f build-darwin-$arch/CMakeCache.txt
    cmake --preset darwin-$arch
    cmake --build --preset darwin-$arch --target bb
    cache_upload barretenberg-darwin-$hash.zst build-darwin-$arch/bin
  fi
}

# Build single threaded wasm. Needed when no shared mem available.
function build_wasm {
  set -eu
  if ! cache_download barretenberg-wasm-$hash.zst; then
    rm -f build-wasm/CMakeCache.txt
    cmake --preset wasm
    cmake --build --preset wasm
    cache_upload barretenberg-wasm-$hash.zst build-wasm/bin
  fi
}

# Build multi-threaded wasm. Requires shared memory.
function build_wasm_threads {
  set -eu
  if ! cache_download barretenberg-wasm-threads-$hash.zst; then
    rm -f build-wasm-threads/CMakeCache.txt
    cmake --preset wasm-threads
    cmake --build --preset wasm-threads
    cache_upload barretenberg-wasm-threads-$hash.zst build-wasm-threads/bin
  fi
}

# Build GCC - but only syntax check.
# Note we do miss some deeper GCC checks this way, but they were as noisy
# as they were useful historically, and we have sanitizers.
function build_gcc_syntax_check_only {
  set -eu
  if cache_download barretenberg-gcc-$hash.zst; then
    return
  fi
  cmake --preset gcc -DSYNTAX_ONLY=1
  cmake --build --preset gcc --target bb
  # Note: There's no real artifact here, we fake one for consistency.
  echo success > build-gcc/syntax-check-success.flag
  cache_upload barretenberg-gcc-$hash.zst build-gcc/syntax-check-success.flag
}

# Do basic tests that the fuzzing preset still compiles (does not do optimization or create object files).
function build_fuzzing_syntax_check_only {
  set -eu
  if cache_download barretenberg-fuzzing-$hash.zst; then
    return
  fi
  cmake --preset fuzzing -DSYNTAX_ONLY=1
  cmake --build --preset fuzzing
  # Note: There's no real artifact here, we fake one for consistency.
  echo success > build-fuzzing/syntax-check-success.flag
  cache_upload barretenberg-fuzzing-$hash.zst build-fuzzing/syntax-check-success.flag
}

# Download ignition transcripts. Only needed for tests.
# The actual bb binary uses the flat crs downloaded in barratenberg/bootstrap.sh to ~/.bb-crs.
# TODO: Use the flattened crs. These old transcripts are a pain. Delete this.
function download_old_crs {
  cd ./srs_db
  ./download_ignition.sh 3
  ./download_grumpkin.sh
}

function build_release {
  local arch=$(arch)
  rm -rf build-release
  mkdir build-release

  cp build/bin/bb build-release/bb
  inject_version build-release/bb
  tar -czf build-release/barretenberg-$arch-linux.tar.gz -C build-release --remove-files bb

  # Only release wasms built on amd64.
  if [ "$arch" == "amd64" ]; then
    tar -czf build-release/barretenberg-wasm.tar.gz -C build-wasm/bin barretenberg.wasm
    tar -czf build-release/barretenberg-debug-wasm.tar.gz -C build-wasm/bin barretenberg-debug.wasm
    tar -czf build-release/barretenberg-threads-wasm.tar.gz -C build-wasm-threads/bin barretenberg.wasm
    tar -czf build-release/barretenberg-threads-debug-wasm.tar.gz -C build-wasm-threads/bin barretenberg-debug.wasm
  fi
}

export -f build_native build_darwin build_nodejs_module build_wasm build_wasm_threads build_gcc_syntax_check_only build_fuzzing_syntax_check_only download_old_crs

function build {
  echo_header "bb cpp build"
  builds=(
    build_native
    build_nodejs_module
    build_wasm
    build_wasm_threads
    download_old_crs
  )
  if [ "$(arch)" == "amd64" ] && [ "$CI" -eq 1 ]; then
    # TODO figure out why this is failing on arm64 with ultra circuit builder string op overflow.
    builds+=(build_gcc_syntax_check_only build_fuzzing_syntax_check_only)
  fi
  if [ "$CI_FULL" -eq 1 ]; then
    builds+=(build_darwin)
  fi
  parallel --line-buffered --tag --halt now,fail=1 denoise {} ::: ${builds[@]}
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
      done || (echo "Failed to list tests in $bin" && exit 1)
  done
}

# This is not called in ci. It is just for a developer to run the tests.
function test {
  echo_header "bb test"
  test_cmds | filter_test_cmds | parallelise
}

function build_benchmarks {
  set -eu
  if ! cache_download barretenberg-benchmarks-$hash.zst; then
    parallel --line-buffered --tag -v "denoise \
      'cmake --preset {} && cmake --build --preset {} --target ultra_honk_bench --target client_ivc_bench'" ::: \
      clang16-assert wasm-threads op-count op-count-time
    cache_upload barretenberg-benchmarks-$hash.zst \
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

  # A bit pattern breaking, but the best code to instrument our private IVC flows exists in yarn-project,
  # while the best code for benchmarking these IVC flows exists here.
  ../../yarn-project/end-to-end/bootstrap.sh generate_example_app_ivc_inputs

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
  function client_ivc_flow {
    set -eu
    local flow=$1
    local inputs_folder="$capture_ivc_folder/$flow"
    local start=$(date +%s%N)
    mkdir -p "bench-out/$flow-proof-files"
    # TODO(AD) this should verify but doesn't!
    if [ "$flow" == "amm-add-liquidity" ]; then
      set +e
    fi
    ./build/bin/bb prove -o "bench-out/$flow-proof-files" -b "$inputs_folder/acir.msgpack" -w "$inputs_folder/witnesses.msgpack" --scheme client_ivc --input_type runtime_stack
    set -e
    echo "$flow has proven."
    local end=$(date +%s%N)
    local elapsed_ns=$(( end - start ))
    local elapsed_ms=$(( elapsed_ns / 1000000 ))
    cat > "./bench-out/$flow-ivc.json" <<EOF
    {
      "benchmarks": [
      {
        "name": "$flow-ivc-proof",
        "time_unit": "ms",
        "real_time": ${elapsed_ms}
      }
      ]
    }
EOF
  }

  function run_benchmark {
    set -eu
    local start_core=$(( ($1 - 1) * HARDWARE_CONCURRENCY ))
    local end_core=$(( start_core + (HARDWARE_CONCURRENCY - 1) ))
    echo taskset -c $start_core-$end_core bash -c "$2"
    taskset -c $start_core-$end_core bash -c "$2"
  }

  export -f ultra_honk_release ultra_honk_wasm client_ivc_17_in_20_release client_ivc_release client_ivc_op_count client_ivc_op_count_time client_ivc_wasm client_ivc_flow run_benchmark

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
}

# Upload assets to release.
function release {
  echo_header "bb cpp release"
  do_or_dryrun gh release upload $REF_NAME build-release/* --clobber
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
  "ci")
    build
    test
    ;;
  download_e2e_ivc_inputs)
    # Download the inputs for the private flows.
    # Takes an optional master commit to download them from. Otherwise, downloads from latest master commit.
    git fetch origin master
    # Setting this env var will cause the script to download the inputs from the given commit (through the behavior of cache_content_hash).
    export AZTEC_CACHE_COMMIT=${1:-origin/master}

    # Error if the inputs are not found in cache.
    export DOWNLOAD_ONLY=${DOWNLOAD_ONLY:-1}
    ../../yarn-project/end-to-end/bootstrap.sh generate_example_app_ivc_inputs
    echo "Downloaded inputs for private flows to $capture_ivc_folder"
    ;;
  "hash")
    echo $hash
    ;;
  test|test_cmds|bench|release|build_native|build_wasm|build_wasm_threads|build_gcc_syntax_check_only|build_fuzzing_syntax_check_only|build_darwin|build_release|inject_version)
    $cmd "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
