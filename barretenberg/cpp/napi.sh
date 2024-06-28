#!/usr/bin/env bash

set -e

pushd src/barretenberg/world_state_napi
mkdir -p build
yarn
popd

PRESET=clang16
cmake --preset $PRESET -DCMAKE_BUILD_TYPE=RelWithAssert
cmake --build --preset $PRESET --target world_state_napi

cp build/lib/world_state_napi.node src/barretenberg/world_state_napi/build

node src/barretenberg/world_state_napi/
