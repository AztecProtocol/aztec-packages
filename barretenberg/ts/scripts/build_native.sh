#!/bin/sh
# Builds the wasm and copies it into it's location in dest.
# If you want to build the wasm with debug info for stack traces, use NO_STRIP=1.
set -e

cd $(dirname $0)/..

# Construct arch suffix e.g. amd64-linux
machine="$(uname -m)"
case "$machine" in
  x86_64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) arch="$machine" ;;
esac
case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  *) echo "Unsupported OS: $(uname -s). Only linux and macos are supported." >&2; exit 1 ;;
esac
target="$arch-$os"

if [ -z "$SKIP_CPP_BUILD" ] && [ "${CI:-0}" -eq 0 ]; then
  parallel --line-buffered --tag 'eval ../cpp/bootstrap.sh build_preset {}' ::: 'clang20 --target bb' "zig-node-$target"
fi

mkdir -p ./build/$target

cp ../cpp/build/bin/bb ./build/$target/bb
cp ../cpp/build-zig-node-$target/lib/nodejs_module.node ./build/$target

llvm-strip-20 ./build/$target/bb
llvm-strip-20 ./build/$target/nodejs_module.node
