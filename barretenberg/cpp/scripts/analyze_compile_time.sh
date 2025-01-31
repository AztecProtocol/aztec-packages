#!/usr/bin/env bash
set -eux

PRESET="${PRESET:-wasm-threads}"
TARGET="${TARGET:-barretenberg.wasm}"
INCREMENTAL="${INCREMENTAL:-false}"
# Move above script dir.
cd $(dirname $0)/..

if ! [ -d ~/ClangBuildAnalyzer ] ; then
  git clone https://github.com/aras-p/ClangBuildAnalyzer ~/ClangBuildAnalyzer
  pushd ~/ClangBuildAnalyzer
  mkdir -p build && cd build && cmake .. && make -j
  popd
fi

cmake -DCMAKE_CXX_FLAGS=-ftime-trace --preset "$PRESET" -Bbuild-$PRESET-compiler-profile

cd build-$PRESET-compiler-profile
ninja $TARGET

~/ClangBuildAnalyzer/build/ClangBuildAnalyzer --all . compile-profile.json
~/ClangBuildAnalyzer/build/ClangBuildAnalyzer --analyze compile-profile.json
