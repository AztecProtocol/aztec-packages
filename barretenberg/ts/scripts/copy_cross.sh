#!/bin/bash
# Copies native bb binary and napi module to dest.
set -e
NO_CD=1 source $(git rev-parse --show-toplevel)/ci3/source

cd $(dirname $0)/..

if [ -n "${1:-}" ]; then
  arch="$1"
  mkdir -p ./build/$arch
  cp ../cpp/build-zig-$arch/bin/bb ./build/$arch
  cp ../cpp/build-zig-$arch/lib/nodejs_module.node ./build/$arch
elif semver check "${REF_NAME:-}" && [[ "$(arch)" == "amd64" ]]; then
  # We're building a release.
  # All targets use Zig cross-compilation (Linux targets glibc 2.35).
  for arch in amd64-linux arm64-linux amd64-macos arm64-macos; do
    mkdir -p ./build/$arch
    cp ../cpp/build-zig-$arch/bin/bb ./build/$arch
    cp ../cpp/build-zig-$arch/lib/nodejs_module.node ./build/$arch
  done

  llvm-strip-20 ./build/*/*
else
  echo "This task is expected to be run in an x86 release context."
  exit 1
fi
