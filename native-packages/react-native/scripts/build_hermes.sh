#!/usr/bin/env bash
# Builds Hermes (the VM React Native runs JavaScript on) for this machine, into build/hermes: its runtime
# (lib/libhermesvm.so), JSI (lib/libjsi.a) and their headers. The package's tests run in a host program over it
# (test/hermes_host.cpp), as the JavaScript of an app does.
set -euo pipefail

cd "$(dirname "$0")/.."

# The Hermes React Native 0.88 ships (react-native/sdks/.hermesv1version), which the tests' Babel transform
# (React Native 0.88's preset) targets.
hermes_tag=hermes-v260318099.0.5

out=$PWD/build/hermes
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -sSfL "https://github.com/facebook/hermes/archive/refs/tags/$hermes_tag.tar.gz" | tar -xz -C "$tmp"
src=$tmp/hermes-$hermes_tag

cmake -S "$src" -B "$tmp/build" -G Ninja -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_COMPILER=${CC:-clang} -DCMAKE_CXX_COMPILER=${CXX:-clang++} \
  -DHERMES_ENABLE_INTL=OFF -DHERMES_ENABLE_TEST_SUITE=OFF \
  -DHERMES_ENABLE_DEBUGGER=OFF -DHERMES_BUILD_SHARED_JSI=OFF -DHERMES_BUILD_APPLE_FRAMEWORK=OFF >"$tmp/configure.log" 2>&1 || { cat "$tmp/configure.log"; exit 1; }
cmake --build "$tmp/build" --target hermesvm jsi >"$tmp/build.log" 2>&1 || { tail -50 "$tmp/build.log"; exit 1; }

rm -rf "$out"
mkdir -p "$out/lib" "$out/include"
cp "$(find "$tmp/build" -name libhermesvm.so | head -1)" "$tmp/build/jsi/libjsi.a" "$out/lib/"
(cd "$src/API" && find . -name '*.h' -exec cp --parents {} "$out/include/" \;)
(cd "$src/API/jsi" && find . -name '*.h' -exec cp --parents {} "$out/include/" \;)
(cd "$src/public" && find . -name '*.h' -exec cp --parents {} "$out/include/" \;)
if [ -d "$tmp/build/include" ]; then
  (cd "$tmp/build/include" && find . -name '*.h' -exec cp --parents {} "$out/include/" \;)
fi
