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
    cmake --preset $preset
    cmake --build --preset $preset --target bb
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
  if ! cache_download barretenberg-tests-$hash.tar.gz; then
    github_group "bb build tests"
    denoise ./format.sh check
    denoise "cmake --preset $preset && cmake --build --preset $preset"
    cache_upload barretenberg-tests-$hash.tar.gz build/bin
  fi

  # Download ignition transcripts. Only needed for tests.
  # The actual bb binary uses the flat crs downloaded in barratenberg/bootstrap.sh to ~/.bb-crs.
  # TODO: Use the flattened crs. These old transcripts are a pain.
  denoise "cd ./srs_db && ./download_ignition.sh 3 && ./download_grumpkin.sh"
}

# Print every individual test command. Can be fed into gnu parallel.
# Paths are relative to repo root.
# reference_string.mem_grumpkin_file_consistency fails very specifically in bootstrap_local within gnu parallel context.
# It's fine when run independently, it's fine when run in parallel on sysbox. Weird.
function test_cmds {
  test_should_run barretenberg-test-$hash || return 0

  cd build
  for bin in ./bin/*_tests; do
    bin_name=$(basename $bin)
    $bin --gtest_list_tests | \
      awk -vbin=$bin_name '/^[a-zA-Z]/ {suite=$1} /^[ ]/ {print "barretenberg/cpp/scripts/run_test.sh " bin " " suite$1}' | \
      sed 's/\.$//' | grep -vE '(DISABLED_|reference_string.mem_grumpkin_file_consistency)'
  done
}

# This is not called in ci. It is just for a developer to run the tests.
function test {
  github_group "bb test"
  test_cmds | parallelise
  cache_upload_flag barretenberg-test-$hash &>/dev/null
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