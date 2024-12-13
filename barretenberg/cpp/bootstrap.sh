#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

cmd=${1:-}

# Determine system.
if [[ "$OSTYPE" == "darwin"* ]]; then
  os=macos
elif [[ "$OSTYPE" == "linux-gnu" ]]; then
  os=linux
elif [[ "$OSTYPE" == "linux-musl" ]]; then
  os=linux
else
  echo "Unknown OS: $OSTYPE"
  exit 1
fi

# Pick native toolchain.
if [ "$os" == "macos" ]; then
  preset=default
else
  if [ "$(which clang++-16)" != "" ]; then
    # TODO: Change to clang16-assert, but currently fails.
    preset=clang16
  else
    preset=default
  fi
fi

pic_preset="$preset-pic"

hash=$(cache_content_hash .rebuild_patterns)

function build_native {
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
    cache_upload barretenberg-release-world-state-$hash.tar.gz build-pic/lib
  fi
}

function build_wasm {
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
  parallel --line-buffered -v --tag --memfree 8g denoise {} ::: build_native build_wasm build_wasm_threads
  github_endgroup
}

function test {
  if test_should_run barretenberg-test-$hash; then
    github_group "bb test"
    echo "Building tests..."
    denoise cmake --preset $preset -DCMAKE_BUILD_TYPE=RelWithAssert "&&" cmake --build --preset $preset

    # Download ignition transcripts.
    # TODO: Use the flattened crs. These old transcripts are a pain.
    echo "Downloading srs..."
    denoise "cd ./srs_db && ./download_ignition.sh 3 && ./download_grumpkin.sh"
    if [ ! -d ./srs_db/grumpkin ]; then
      # The Grumpkin SRS is generated manually at the moment, only up to a large enough size for tests
      # If tests require more points, the parameter can be increased here. Note: IPA requires
      # dyadic_circuit_size + 1 points so in general this number will be a power of two plus 1
      cd ./build && cmake --build . --parallel --target grumpkin_srs_gen && ./bin/grumpkin_srs_gen 32769
    fi

    echo "Testing..."
    (cd build && GTEST_COLOR=1 denoise ctest -j32 --output-on-failure)
    cache_upload_flag barretenberg-test-$hash
    github_endgroup
  fi
}

case "$cmd" in
  "clean")
    git clean -fdx
    ;;
  ""|"fast"|"full")
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
  *)
    echo "Unknown command: $cmd"
    exit 1
esac