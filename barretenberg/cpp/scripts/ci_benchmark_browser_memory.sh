#!/usr/bin/env bash
# Runs a in-browser memory benchmark for Client IVC proving.
# This is used to get as realistic as possible memory usage for the proving of a private transaction in a browser setting.

source $(git rev-parse --show-toplevel)/ci3/source
cd ..

flow=${1:-"ecdsar1+transfer_0_recursions+sponsored_fpc"}
mkdir -p bench-out/

# NOTE: if port issues are hit, make sure no other test has the string '9339' for a port
export PORT=9339

# Run server.
yarn --cwd ../acir_tests/browser-test-app serve &
server_pid=$!
trap "kill $server_pid 2>/dev/null" EXIT SIGINT
sleep 2 # Give server time to start

# Run the benchmark.
name_path="app_proving/$flow/chrome-wasm"
bench_folder="bench-out/$name_path"
mkdir -p "$bench_folder"
BROWSER=chrome ../acir_tests/headless-test/bb.js.browser prove_client_ivc -i ../../yarn-project/end-to-end/example-app-ivc-inputs-out/$flow/ivc-inputs.msgpack --verbose 2>&1 | tee /dev/tty)
# Each output reports the peak memory usage - the last one therefore is usable as the total application peak memory usage.
memory=$(echo "$output" | grep -o "(mem: [0-9.]*MiB)" | tail -1 | grep -o "[0-9.]*")

# Report memory such that it will be picked up by the CI system.
cat > "$output/benchmarks.bench.json" <<EOF
[
  {
    "name": "$name_path/memory",
    "unit": "MB",
    "value": ${memory_mb}
  }
]
EOF
