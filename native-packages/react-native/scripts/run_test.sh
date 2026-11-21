#!/usr/bin/env bash
# Runs one of the package's Hermes tests: bundles it as Metro would resolve it for an app (the react-native
# export condition and package field), transforms it with React Native's Babel preset as Metro does, and runs it in build/hermes_host with a
# fresh data directory. bb's, the ACVM's and the echo example's native libraries are loaded from this tree's builds;
# kv-sqlite is compiled into the host, as into an app.
set -euo pipefail

cd "$(dirname "$0")/.."
root=$(git rev-parse --show-toplevel)
test=$1

work=${KEEP_WORK:-$(mktemp -d)}; mkdir -p "$work"
[ -n "${KEEP_WORK:-}" ] || trap 'rm -rf "$work"' EXIT

NODE_PATH=$PWD/node_modules node_modules/.bin/esbuild "$test" --bundle --format=iife --platform=neutral \
  --conditions=react-native --main-fields=react-native,module,main --target=es2017 --supported:bigint=true --log-level=warning --external:react-native \
  --alias:@aztec-foundation/bb.js="$root/barretenberg/ts/bb.js" --outfile="$work/bundle.js"
node_modules/.bin/babel --no-babelrc --config-file "$PWD/test/babel.config.json" --compact true "$work/bundle.js" \
  -o "$work/test.js"

AZTEC_RN_DATA_DIR=$work/data \
  LD_LIBRARY_PATH="$root/barretenberg/cpp/build/lib:$root/native-packages/acvm/rust/target/release:$root/ipc-codegen/echo_example/rust/target/debug${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
  build/hermes_host "$work/test.js"
