#!/usr/bin/env bash
#
# Cross-language IPC wire compatibility test matrix.
# Tests all server/client language pairs for the echo service.
#
# Usage: ./scripts/run_cross_language_tests.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEST_DIR="$(dirname "$SCRIPT_DIR")"
cd "$TEST_DIR"

PASS=0
FAIL=0
TOTAL=0

# Build Rust binaries
echo "Building Rust echo binaries..."
(cd rust && cargo build --quiet 2>&1)

# Build C++ binaries
echo "Building C++ echo binaries..."
MSGPACK_INC="$(cd "$TEST_DIR/../.." && pwd)/cpp/build/_deps/msgpack-c/src/msgpack-c/include"
if [ -d "$MSGPACK_INC" ]; then
  (cd cpp && clang++ -std=c++20 -I "$MSGPACK_INC" -DMSGPACK_NO_BOOST -DMSGPACK_USE_STD_VARIANT_ADAPTOR -o echo_server echo_server.cpp 2>&1)
  (cd cpp && clang++ -std=c++20 -I "$MSGPACK_INC" -DMSGPACK_NO_BOOST -DMSGPACK_USE_STD_VARIANT_ADAPTOR -o echo_client echo_client.cpp 2>&1)
  CPP_AVAILABLE=true
else
  echo "  (skipping C++ — msgpack-c not found at $MSGPACK_INC, run cmake first)"
  CPP_AVAILABLE=false
fi

# Install TS dependencies if needed
if [ ! -d ts/node_modules ]; then
  echo "Installing TS dependencies..."
  (cd ts && npm install --no-package-lock --quiet 2>&1)
fi

# Server/client definitions
# Format: "lang:start_cmd:name"
SERVERS=(
  "rust:rust/target/debug/echo_server:Rust"
  "ts:npx tsx ts/echo_server.ts:TS"
)
CLIENTS=(
  "rust:rust/target/debug/echo_client:Rust"
  "ts:npx tsx ts/echo_client.ts:TS"
)

if [ "$CPP_AVAILABLE" = true ]; then
  SERVERS+=("cpp:cpp/echo_server:C++")
  CLIENTS+=("cpp:cpp/echo_client:C++")
fi

run_pair() {
  local server_cmd="$1"
  local server_name="$2"
  local client_cmd="$3"
  local client_name="$4"

  TOTAL=$((TOTAL + 1))
  local socket="/tmp/echo-matrix-${server_name}-${client_name}-$$.sock"

  # Start server
  $server_cmd --socket "$socket" &
  local server_pid=$!

  # Wait for socket (up to 2 seconds)
  for i in $(seq 1 20); do
    if [ -S "$socket" ]; then break; fi
    sleep 0.1
  done

  if [ ! -S "$socket" ]; then
    echo "  FAIL: server did not create socket"
    FAIL=$((FAIL + 1))
    kill $server_pid 2>/dev/null || true
    return
  fi

  # Run client
  if $client_cmd --socket "$socket" 2>/dev/null; then
    echo "  PASS: $server_name server + $client_name client"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $server_name server + $client_name client"
    FAIL=$((FAIL + 1))
  fi

  # Cleanup
  wait $server_pid 2>/dev/null || true
  rm -f "$socket"
}

# ---------------------------------------------------------------------------
# Level 1: Golden file deserialization tests
# ---------------------------------------------------------------------------
echo "=== Golden File Deserialization Tests ==="
echo ""

# Generate golden files from Rust reference
echo "Generating golden files from Rust reference..."
(cd rust && cargo build --quiet --bin generate_golden 2>&1)
rust/target/debug/generate_golden --output-dir golden 2>/dev/null

# Rust golden test
echo "  Rust:"
if (cd rust && cargo build --quiet --bin golden_test 2>&1) && \
   rust/target/debug/golden_test --golden-dir golden 2>/dev/null; then
  echo "    PASS"
  PASS=$((PASS + 1))
else
  echo "    FAIL"
  FAIL=$((FAIL + 1))
fi
TOTAL=$((TOTAL + 1))

# TypeScript golden test
echo "  TypeScript:"
if npx tsx ts/golden_test.ts 2>/dev/null; then
  echo "    PASS"
  PASS=$((PASS + 1))
else
  echo "    FAIL"
  FAIL=$((FAIL + 1))
fi
TOTAL=$((TOTAL + 1))

echo ""

# ---------------------------------------------------------------------------
# Level 2+3: IPC Round-Trip Matrix
# ---------------------------------------------------------------------------
echo "=== Cross-Language Wire Compatibility Matrix ==="
echo ""

for server_entry in "${SERVERS[@]}"; do
  IFS=: read -r _ server_cmd server_name <<< "$server_entry"
  for client_entry in "${CLIENTS[@]}"; do
    IFS=: read -r _ client_cmd client_name <<< "$client_entry"
    run_pair "$server_cmd" "$server_name" "$client_cmd" "$client_name"
  done
done

echo ""
echo "Results: $PASS/$TOTAL passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
