#!/usr/bin/env bash
# Copies bb's LMDB NAPI module to build/. The bb binary itself ships with @aztec-foundation/bb.js-api.
set -e
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

cd $(dirname $0)/..

# Construct target suffix e.g. amd64-linux
target="$(arch)-$(os)"

if [ "${BUILD_CPP:-0}" -eq 1 ]; then
  ../../cpp/bootstrap.sh build_preset clang20 --target nodejs_module
fi

mkdir -p ./build/$target

cp ../../cpp/build/lib/nodejs_module.node ./build/$target
