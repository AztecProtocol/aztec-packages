#!/usr/bin/env bash

set -e

cd "$(dirname "$0")/.."

# relatiev path from the directory containing package.json
WORLD_STATE_LIB_PATH=../../barretenberg/cpp/build/bin/world_state_napi.node

build_addon() {
  (cd ../../barretenberg/cpp; cmake --preset clang16-pic -DCMAKE_BUILD_TYPE=RelWithAssert; cmake --build --preset clang16-pic --target world_state_napi; echo $PWD; mkdir -p build/bin;  cp ./build-pic/lib/world_state_napi.node ./build/bin/world_state_napi.node)
}

cp_addon_lib() {
  if [ -f $WORLD_STATE_LIB_PATH ]; then
    echo "Copying world_state_napi.node to build directory"
    rm -rf build
    mkdir build
    cp $WORLD_STATE_LIB_PATH build/world_state_napi.node
  else
    echo "world_state_napi.node not found at $WORLD_STATE_LIB_PATH"
    echo "Skipping copy to build directory"
    echo "NativeWorldStateService will not work without this file"
  fi
}

build_ts() {
  tsc -b .
}

case $1 in
  cpp)
    build_addon
    cp_addon_lib
    ;;
  ts)
    cp_addon_lib
    build_ts
    ;;
  *)
    echo "Usage: $0 {cpp|ts}"
    exit 1
    ;;
esac
