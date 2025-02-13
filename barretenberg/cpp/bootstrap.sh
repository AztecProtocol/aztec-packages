#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

preset=clang16-assert
pic_preset="clang16-pic"
hash=$(cache_content_hash .rebuild_patterns)

function build_native {
  set -eu
  if ! cache_download barretenberg-release-$hash.tar.gz; then
    rm -f build/CMakeCache.txt
    echo "Building with preset: $preset"
    cmake --preset $preset -Bbuild
    cmake --build build --target bb
    cache_upload barretenberg-release-$hash.tar.gz build/bin
  fi

  (cd src/barretenberg/nodejs_module && yarn --frozen-lockfile --prefer-offline)
  if ! cache_download barretenberg-release-nodejs-module-$hash.tar.gz; then
    rm -f build-pic/CMakeCache.txt
    cmake --preset $pic_preset -DCMAKE_BUILD_TYPE=RelWithAssert
    cmake --build --preset $pic_preset --target nodejs_module
    cache_upload barretenberg-release-nodejs-module-$hash.tar.gz build-pic/lib/nodejs_module.node
  fi
}

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

function build {
  github_group "bb cpp build"
  export preset pic_preset hash
  export -f build_native build_wasm build_wasm_threads
  parallel --line-buffered -v --tag denoise {} ::: build_native build_wasm build_wasm_threads
  github_endgroup
}

function build_tests {
  github_group "bb build tests"
  denoise ./format.sh check
  denoise cmake --preset $preset -Bbuild "&&" cmake --build build
  # Download ignition transcripts. Only needed for tests.
  # The actual bb binary uses the flat crs downloaded in barratenberg/bootstrap.sh to ~/.bb-crs.
  # TODO: Use the flattened crs. These old transcripts are a pain.
  denoise "cd ./srs_db && ./download_ignition.sh 3 && ./download_grumpkin.sh"
}

function test {
  test_should_run barretenberg-test-$hash || return 0
  github_group "bb test"
  (cd build && GTEST_COLOR=1 denoise ctest -j32 --output-on-failure)
  cache_upload_flag barretenberg-test-$hash
  github_endgroup
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
  "build-tests")
    # Build the entire native repo, including all tests and benchmarks.
    build_tests
    ;;
  "test")
    # Run the tests. Assumes they've been (re)built with a call to build_tests.
    test
    ;;
  "ci")
    build
    build_tests
    test
    ;;
  "hash")
    echo $hash
    ;;
  "test-cmds")
    # Print every individual test command. Can be fed into gnu parallel.
    cd build
    for bin in ./bin/*_tests; do
      bin_name=$(basename $bin)
      $bin --gtest_list_tests | \
        awk -vbin=$bin_name '/^[a-zA-Z]/ {suite=$1} /^[ ]/ {print "barretenberg/cpp/scripts/run_test.sh " bin " " suite$1}' | \
        sed 's/\.$//' | grep -v 'DISABLED_'
    done
    ;;
  *)
    echo "Unknown command: $cmd"
    exit 1
esac
