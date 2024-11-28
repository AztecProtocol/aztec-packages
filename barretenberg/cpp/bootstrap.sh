#!/usr/bin/env bash
# Use ci3 script base.
source $(git rev-parse --show-toplevel)/ci3/base/source

cleanup() {
    BG_PIDS=$(jobs -p)
    if [[ -n "$BG_PIDS" ]]; then
        kill $BG_PIDS 2>/dev/null
        wait $BG_PIDS 2>/dev/null
    fi
}
trap cleanup EXIT

CMD=${1:-}

$ci3/github/group "bb cpp build"

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -ffdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

# Determine system.
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS=macos
elif [[ "$OSTYPE" == "linux-gnu" ]]; then
  OS=linux
elif [[ "$OSTYPE" == "linux-musl" ]]; then
  OS=linux
else
  echo "Unknown OS: $OSTYPE"
  exit 1
fi

# Attempt to just pull artefacts from CI and exit on success.
if [ -n "${USE_CACHE:-}" ] && ./bootstrap_cache.sh ; then
  # This ensures the build later will no-op
  SKIP_BUILD=1
fi

# Download ignition transcripts.
(cd ./srs_db && ./download_ignition.sh 3 && ./download_grumpkin.sh)

# Pick native toolchain file.
ARCH=$(uname -m)
if [ "$OS" == "macos" ]; then
  PRESET=default
else
  if [ "$(which clang++-16)" != "" ]; then
    PRESET=clang16
  else
    PRESET=default
  fi
fi

PIC_PRESET="$PRESET-pic"

# Remove cmake cache files.
rm -f {build,build-wasm,build-wasm-threads}/CMakeCache.txt

(cd src/barretenberg/world_state_napi && yarn --frozen-lockfile --prefer-offline)

export AZTEC_CACHE_REBUILD_PATTERNS=.rebuild_patterns
HASH=$($ci3/cache/content_hash)
function build_native {
  echo "#################################"
  echo "# Building with preset: $PRESET"
  echo "# When running cmake directly, remember to use: --build --preset $PRESET"
  echo "#################################"
  # Build bb with standard preset and world_state_napi with Position Independent code variant
  cmake --preset $PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
  cmake --preset $PIC_PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
  cmake --build --preset $PRESET --target bb
  cmake --build --preset $PIC_PRESET --target world_state_napi
  # copy the world_state_napi build artifact over to the world state in yarn-project
  mkdir -p ../../yarn-project/world-state/build/
  cp ./build-pic/lib/world_state_napi.node ../../yarn-project/world-state/build/

  $ci3/cache/upload barretenberg-preset-release-$HASH.tar.gz build/bin
  $ci3/cache/upload barretenberg-preset-release-world-state-$HASH.tar.gz build-pic/lib
}

function build_wasm {
  cmake --preset wasm
  cmake --build --preset wasm
  $ci3/cache/upload barretenberg-preset-wasm-$HASH.tar.gz build-wasm/bin
}

function build_wasm_threads {
  cmake --preset wasm-threads
  cmake --build --preset wasm-threads
  $ci3/cache/upload barretenberg-preset-wasm-threads-$HASH.tar.gz build-wasm-threads/bin
  echo $?
}

if [ "${SKIP_BUILD:-0}" -eq 0 ] ; then
  export PRESET PIC_PRESET HASH ci3
  export -f build_native build_wasm build_wasm_threads

  parallel --line-buffered -v --tag --memfree 8g $ci3/base/denoise {} ::: build_native build_wasm build_wasm_threads
fi

if [ ! -d ./srs_db/grumpkin ]; then
  # The Grumpkin SRS is generated manually at the moment, only up to a large enough size for tests
  # If tests require more points, the parameter can be increased here. Note: IPA requires
  # dyadic_circuit_size + 1 points so in general this number will be a power of two plus 1
  cd ./build && cmake --build . --parallel --target grumpkin_srs_gen && ./bin/grumpkin_srs_gen 32769
fi

if $ci3/base/is_test && $ci3/cache/should_run barretenberg-test-$HASH; then
  cmake --preset $PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
  cmake --build --preset $PRESET
  (cd build && GTEST_COLOR=1 ctest -j32 --output-on-failure)
  $ci3/cache/upload_flag barretenberg-test-$HASH
fi
$ci3/github/endgroup