#!/bin/bash
# Copies native bb binary and napi module to dest.
set -e
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

cd $(dirname $0)/..

if semver check "${REF_NAME:-}" && [[ "$(arch)" == "amd64" ]]; then
  # We're building a release.
  # We take host build for amd64-linux.
  mkdir -p ./build/amd64-linux
  cp ../cpp/build/bin/bb ./build/amd64-linux
  cp ../cpp/build/lib/nodejs_module.node ./build/amd64-linux

  # We also copy in all cross-compiled architectures for release builds.
  for arch in arm64-linux amd64-macos arm64-macos; do
    mkdir -p ./build/$arch
    cp ../cpp/build-zig-$arch/bin/bb ./build/$arch
    cp ../cpp/build-zig-$arch/lib/nodejs_module.node ./build/$arch
  done

  llvm-strip-20 ./build/*/*
else
  echo "This task is expected to be run in an x86 release context."
  exit 1
fi
