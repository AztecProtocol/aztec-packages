#!/usr/bin/env bash

set -e

cd "$(dirname "$0")/.."

# relatiev path from the directory containing package.json
WORLD_STATE_LIB_PATH=../../barretenberg/cpp/build-pic/lib/nodejs_module.node
PRESET=${PRESET:-clang16-pic}

build_addon() {
  (cd ../../barretenberg/cpp; cmake --preset $PRESET; cmake --build --preset $PRESET --target nodejs_module; echo $PWD; mkdir -p build/bin;  cp ./build-pic/lib/nodejs_module.node ./build/bin/nodejs_module.node)
}

cp_addon_lib() {
  if [ -f $WORLD_STATE_LIB_PATH ]; then
    echo "Copying $(realpath $WORLD_STATE_LIB_PATH) to build directory"
    rm -rf build
    mkdir build
    cp $WORLD_STATE_LIB_PATH build/nodejs_module.node
  else
    echo "nodejs_module.node not found at $WORLD_STATE_LIB_PATH"
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
