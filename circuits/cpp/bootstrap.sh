#!/bin/bash
# Takes a list of targets from commandline
set -eu

cd "$(dirname "$0")"

CMD=${1:-}

if [ -n "$CMD" ]; then
  if [ "$CMD" = "clean" ]; then
    git clean -fdx
    exit 0
  else
    echo "Unknown command: $CMD"
    exit 1
  fi
fi

export WASI_VERSION=20

# Update the submodule
git submodule update --init --recursive

# Determine system.
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS=macos
elif [[ "$OSTYPE" == "linux-gnu" ]]; then
  OS=linux
else
  echo "Unknown OS: $OSTYPE"
  exit 1
fi

# Pick native toolchain file.
ARCH=$(uname -m)
if [ "$OS" == "macos" ]; then
  if [ "$(which brew)" != "" ]; then
    export BREW_PREFIX=$(brew --prefix)

    # Ensure we have toolchain.
    if [ ! "$?" -eq 0 ] || [ ! -f "$BREW_PREFIX/opt/llvm/bin/clang++" ]; then
      echo "Default clang not sufficient. Install homebrew, and then: brew install llvm libomp clang-format"
      exit 1
    fi

    PRESET=homebrew
  else
    PRESET=default
  fi
else
  if [ "$(which clang++-16)" != "" ]; then
    PRESET=clang16
  else
    PRESET=default
  fi
fi

echo "#################################"
echo "# Building with preset: $PRESET"
echo "# When running cmake directly, remember to use: --build --preset $PRESET"
echo "#################################"

# Build native.
cmake --preset $PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
cmake --build --preset $PRESET ${@/#/--target }

# Build WASM.
if [ -n "${WASM_DEBUG:-}" ] ; then
  cmake --preset wasm-dbg
  cmake --build --preset wasm-dbg
else
  cmake --preset wasm
  cmake --build --preset wasm
fi
