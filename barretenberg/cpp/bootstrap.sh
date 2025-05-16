#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}
[ -n "$cmd" ] && shift

export native_preset=${NATIVE_PRESET:-clang16-assert}
export pic_preset=${PIC_PRESET:-clang16-pic-assert}
export hash=$(cache_content_hash .rebuild_patterns)

# Injects version number into a given bb binary.
# Means we don't actually need to rebuild bb to release a new version if code hasn't changed.
function inject_version {
  local binary=$1
  if semver check "$REF_NAME"; then
    local version=${REF_NAME#v}
  else
    # Otherwise, use the commit hash as the version.
    local version=$(git rev-parse --short HEAD)
  fi
  local placeholder='00000000.00000000.00000000'
  if [ ${#version} -gt ${#placeholder} ]; then
    echo_stderr "Error: version ($version) is longer than placeholder. Cannot update bb binaries."
    exit 1
  fi
  local offset=$(grep -aobF "$placeholder" $binary | head -n 1 | cut -d: -f1)
  if [ -z "$offset" ]; then
    echo "Placeholder not found in $binary, can't inject version."
    exit 1
  fi
  printf "$version\0" | dd of=$binary bs=1 seek=$offset conv=notrunc 2>/dev/null
}

# Define build commands for each preset
function build_preset() {
  local preset=$1
  shift
  cmake --fresh --preset "$preset"
  cmake --build --preset "$preset" "$@"
}

# Build all native binaries, including tests.
function build_native {
  set -eu
  if ! cache_download barretenberg-native-$hash.zst; then
    ./format.sh check
    build_preset $native_preset
    cache_upload barretenberg-native-$hash.zst build/bin
  fi
}

function build_nodejs_module {
  set -eu
  (cd src/barretenberg/nodejs_module && yarn --frozen-lockfile --prefer-offline)
  if ! cache_download barretenberg-native-nodejs-module-$hash.zst; then
    build_preset $pic_preset --target nodejs_module
    cache_upload barretenberg-native-nodejs-module-$hash.zst build-pic/lib/nodejs_module.node
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

    build_preset darwin-$arch --target bb
    cache_upload barretenberg-darwin-$hash.zst build-darwin-$arch/bin
  fi
}

# Build single threaded wasm. Needed when no shared mem available.
function build_wasm {
  set -eu
  if ! cache_download barretenberg-wasm-$hash.zst; then
    build_preset wasm
    cache_upload barretenberg-wasm-$hash.zst build-wasm/bin
  fi
}

# Build multi-threaded wasm. Requires shared memory.
function build_wasm_threads {
  set -eu
  if ! cache_download barretenberg-wasm-threads-$hash.zst; then
    build_preset wasm-threads
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

export -f build_preset build_native build_darwin build_nodejs_module build_wasm build_wasm_threads build_gcc_syntax_check_only build_fuzzing_syntax_check_only

function build {
  echo_header "bb cpp build"
  builds=(
    build_native
    build_nodejs_module
    build_wasm
    build_wasm_threads
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
# We prefix the hash. This ensures the test harness and cache and skip future runs.
function test_cmds {
  cd build
  for bin in ./bin/*_tests; do
    local bin_name=$(basename $bin)

    $bin --gtest_list_tests | \
      awk '/^[a-zA-Z]/ {suite=$1} /^[ ]/ {print suite$1}' | \
      grep -v 'DISABLED_' | \
      while read -r test; do
        local prefix=$hash
        # A little extra resource for these tests.
        # IPARecursiveTests and AcirHonkRecursionConstraint fail with 2 threads.
        if [[ "$test" =~ ^(AcirAvmRecursionConstraint|ClientIVCKernelCapacity|AvmRecursiveTests|IPARecursiveTests|AcirHonkRecursionConstraint) ]]; then
          prefix="$prefix:CPUS=4:MEM=8g"
        fi
        echo -e "$prefix barretenberg/cpp/scripts/run_test.sh $bin_name $test"
      done || (echo "Failed to list tests in $bin" && exit 1)
  done
  echo "$hash barretenberg/cpp/scripts/test_civc_standalone_vks_havent_changed.sh"
}

# This is not called in ci. It is just for a developer to run the tests.
function test {
  echo_header "bb test"
  test_cmds | filter_test_cmds | parallelise
}

function build_bench {
  set -eu
  if ! cache_download barretenberg-benchmarks-$hash.zst; then
    # Run builds in parallel with different targets per preset
    # bb_cli_bench is later used in yarn-project.
    parallel --line-buffered denoise ::: \
      "build_preset $native_preset --target ultra_honk_bench --target client_ivc_bench  --target bb_cli_bench" \
      "build_preset wasm-threads --target ultra_honk_bench --target client_ivc_bench  --target bb_cli_bench"
    cache_upload barretenberg-benchmarks-$hash.zst \
      {build,build-wasm-threads}/bin/{ultra_honk_bench,client_ivc_bench}
  fi
}

function bench_cmds {
  prefix="$hash:CPUS=16"
  # arch name bin filter
  benches=(
    "native bb-micro-bench/native/ultra_honk build/bin/ultra_honk_bench construct_proof_ultrahonk_power_of_2/20$"
    "native bb-micro-bench/native/client_ivc build/bin/client_ivc_bench ClientIVCBench/Full/6$"
    "native bb-micro-bench/native/client_ivc_17_in_20 build/bin/client_ivc_bench ClientIVCBench/Ambient_17_in_20/6$"
    "wasm bb-micro-bench/wasm/ultra_honk build-wasm-threads/bin/ultra_honk_bench construct_proof_ultrahonk_power_of_2/20$"
    "wasm bb-micro-bench/wasm/client_ivc build-wasm-threads/bin/client_ivc_bench ClientIVCBench/Full/6$"
  )
  for args in "${benches[@]}"; do
    echo "$prefix barretenberg/cpp/scripts/run_bench.sh $args"
  done
}

# Runs benchmarks sharded over machine cores.
function bench {
  echo_header "bb bench"
  rm -rf bench-out && mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelise
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
  bench_ivc)
    # Intended only for dev usage. For CI usage, we run yarn-project/end-to-end/bootstrap.sh bench.
    # Download the inputs for the private flows.
    # Takes an optional master commit to download them from. Otherwise, downloads from latest master commit.
    git fetch origin master

    # build the benchmarked benches
    parallel --line-buffered --tag -v denoise ::: \
      "build_preset $native_preset --target bb_cli_bench" \
      "build_preset wasm-threads --target bb_cli_bench"

    # Setting this env var will cause the script to download the inputs from the given commit (through the behavior of cache_content_hash).
    if [ -n "${1:-}" ]; then
      echo "Downloading inputs from commit $1."
      export AZTEC_CACHE_COMMIT=$1
      export DOWNLOAD_ONLY=1
      # Since this path doesn't otherwise need a non-bb bootstrap, we make sure the one dependency is built.
      # This generates the client IVC verification keys.
      yarn --cwd ../../yarn-project/bb-prover generate
    fi

    # Recreation of logic from bench.
    ../../yarn-project/end-to-end/bootstrap.sh generate_example_app_ivc_inputs
    ../../barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh $(pwd)/../../yarn-project/end-to-end/example-app-ivc-inputs-out $(pwd)/bench-out
    ;;
  "hash")
    echo $hash
    ;;
  test|test_cmds|bench|bench_cmds|build_bench|release|build_native|build_nodejs_module|build_wasm|build_wasm_threads|build_gcc_syntax_check_only|build_fuzzing_syntax_check_only|build_darwin|build_release|inject_version)
    $cmd "$@"
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
