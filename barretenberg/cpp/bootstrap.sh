#!/usr/bin/env bash
set -eu

# Navigate to script folder
cd "$(dirname "$0")"

CMD=${1:-}

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

# Download ignition transcripts.
(cd ./srs_db && ./download_ignition.sh 0)

# Install wasi-sdk.
./scripts/install-wasi-sdk.sh

# Attempt to just pull artefacts from CI and exit on success.
[ -n "${USE_CACHE:-}" ] && ./bootstrap_cache.sh && exit

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

# Remove cmake cache files.
rm -f {build,build-wasm,build-wasm-threads}/CMakeCache.txt

echo "#################################"
echo "# Building with preset: $PRESET"
echo "# When running cmake directly, remember to use: --build --preset $PRESET"
echo "#################################"

function build_native {
  cmake --preset $PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
  cmake --build --preset $PRESET --target bb
}

function build_wasm {
  cmake --preset wasm
  cmake --build --preset wasm
}

function build_wasm_threads {
  cmake --preset wasm-threads
  cmake --build --preset wasm-threads
}

g="\033[32m"  # Green
b="\033[34m"  # Blue
p="\033[35m"  # Purple
r="\033[0m"   # Reset

(build_native > >(awk -v g="$g" -v r="$r" '$0=g"native: "r $0')) &
(build_wasm > >(awk -v b="$b" -v r="$r" '$0=b"wasm: "r $0')) &
(build_wasm_threads > >(awk -v p="$p" -v r="$r" '$0=p"wasm_threads: "r $0')) &

wait

if [ ! -d ./srs_db/grumpkin ]; then
  # The Grumpkin SRS is generated manually at the moment, only up to a large enough size for tests
  # If tests require more points, the parameter can be increased here.
  cd ./build && cmake --build . --parallel --target grumpkin_srs_gen && ./bin/grumpkin_srs_gen 8192
fi
