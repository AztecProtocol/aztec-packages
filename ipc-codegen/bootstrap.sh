#!/usr/bin/env bash
# IPC codegen package.
# Generates IPC bindings from committed JSON schemas under schemas/, in TS, C++,
# Rust and Zig. Zero npm dependencies — runs with just Node.js (v22+).
#
# The build's only direct consumer is its own cross-language test harness under
# examples/. Service consumers (bb, wsdb, cdb, avm) are wired up by their
# own bootstrap scripts, which invoke `ipc-codegen/bootstrap.sh build` as
# a build-time prerequisite.

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)

NODE_FLAGS="--experimental-strip-types --experimental-transform-types --no-warnings"

gen() { node $NODE_FLAGS src/generate.ts "$@"; }

function build {
  echo_header "ipc-codegen build"

  # Service generation (bb, wsdb, cdb, avm) is invoked by each service's own
  # bootstrap as those consumers migrate over. The build step here only
  # generates the echo example bindings + compiles the per-language test
  # binaries that test_cmds emits commands against.
  examples/echo-schema/generate.sh

  echo "Building Rust echo binaries..."
  (cd examples/rust/echo && cargo build --quiet)

  echo "Building Zig echo binaries..."
  (cd examples/zig/echo && zig build)

  echo "Installing TS echo deps..."
  if [ ! -d examples/ts/echo/node_modules ]; then
    (cd examples/ts/echo && npm install --no-package-lock --quiet)
  fi

  # C++ needs msgpack-c headers. We pick them up from a local bb cmake build
  # for now; if absent the C++ matrix pairs are skipped in test_cmds below.
  local MSGPACK_INC
  MSGPACK_INC="$(cd ../barretenberg/cpp/build/_deps/msgpack-c/src/msgpack-c/include 2>/dev/null && pwd)" || true
  if [ -n "${MSGPACK_INC:-}" ] && [ -d "$MSGPACK_INC" ]; then
    echo "Building C++ echo binaries..."
    local CXX_FLAGS="-std=c++20 -I $MSGPACK_INC -DMSGPACK_NO_BOOST -DMSGPACK_USE_STD_VARIANT_ADAPTOR"
    (cd examples/cpp/echo && clang++ $CXX_FLAGS -o echo_server echo_server.cpp)
    (cd examples/cpp/echo && clang++ $CXX_FLAGS -o echo_client echo_client.cpp generated/echo_ipc_client.cpp)
  else
    echo "Skipping C++ echo build — msgpack-c not present at ../barretenberg/cpp/build/_deps/"
  fi

  # Pre-bake golden fixtures from the Rust reference so the per-language
  # golden tests are pure deserialization (no shared write-then-read).
  examples/rust/echo/target/debug/generate_golden --output-dir examples/echo-schema/golden
}

function test_cmds {
  # Discover which languages can participate. Rust/TS/Zig are unconditional
  # (build() always builds them); C++ is conditional on bb's msgpack being present.
  local matrix_langs=(rust ts zig)
  if [ -x examples/cpp/echo/echo_server ]; then
    matrix_langs+=(cpp)
  fi

  local prefix="$hash:CPUS=1:TIMEOUT=120s"
  local script="ipc-codegen/examples/scripts/run_cross_language_test.sh"

  # Golden tests (Rust + TS each verify they can deserialize the goldens
  # baked by build()).
  echo "$prefix $script golden rust"
  echo "$prefix $script golden ts"

  # Matrix: one command per (server, client) pair.
  for server in "${matrix_langs[@]}"; do
    for client in "${matrix_langs[@]}"; do
      echo "$prefix $script matrix $server $client"
    done
  done
}

function test {
  echo_header "ipc-codegen test"
  test_cmds | filter_test_cmds | parallelize
}

case "$cmd" in
  "")
    build
    ;;
  "hash")
    echo "$hash"
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
