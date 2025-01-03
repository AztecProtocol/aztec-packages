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
  github_group "bb cpp build"
  parallel --line-buffered --tag denoise {} ::: build_native build_wasm build_wasm_threads download_old_crs
  github_endgroup
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
  github_group "bb test"
  test_cmds | filter_test_cmds | parallelise
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
  *)
    echo "Unknown command: $cmd"
    exit 1
esac