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
  # The Rust crate compiles the ipc-runtime sources itself via the `cc`
  # build-dependency; no prebuilt archive needed.
  (cd examples/rust/echo && cargo build --quiet)

  echo "Building Zig echo binaries..."
  (cd examples/zig/echo && zig build)

  # The TS echo example consumes @aztec/ipc-runtime via a `file:` link. npm
  # copies the package directory at install time, so ipc-runtime/ts/dest/ AND
  # ts/build/<arch>-<os>/ipc_runtime_napi.node must already be populated when
  # echo's npm install runs. Both are gitignored, so on a clean CI checkout
  # they don't exist — build them here via ipc-runtime's own bootstrap. The
  # bootstrap builds the C++ static lib, runs the C++ tests, builds the NAPI
  # addon, and copies it into ts/build/<arch>-<os>/.
  echo "Building ipc-runtime (C++ lib + NAPI addon + TS dest)..."
  (cd ../ipc-runtime && ./bootstrap.sh)
  (cd ../ipc-runtime/ts && yarn install --immutable && yarn build)

  echo "Installing TS echo deps..."
  # Force a clean install so the file:-linked @aztec/ipc-runtime is re-copied
  # with the freshly built dest/ included.
  rm -rf examples/ts/echo/node_modules
  (cd examples/ts/echo && npm install --no-package-lock --quiet)

  # C++ echo binaries compile the ipc-runtime .cpp sources directly into each
  # binary (no prebuilt archive, no IPC_RUNTIME_LIB_DIR). msgpack-c headers
  # are borrowed from bb's cmake build until we have a standalone source.
  local IPC_RUNTIME_INC IPC_RUNTIME_SRCS
  IPC_RUNTIME_INC="$(cd ../ipc-runtime/cpp 2>/dev/null && pwd)" || true
  if [ -n "${IPC_RUNTIME_INC:-}" ]; then
    # Skip *.test.cpp — those depend on gtest which is bb's build dep.
    IPC_RUNTIME_SRCS="$(ls "$IPC_RUNTIME_INC"/ipc_runtime/*.cpp "$IPC_RUNTIME_INC"/ipc_runtime/shm/*.cpp 2>/dev/null | grep -v '\.test\.cpp$' | tr '\n' ' ')"
  fi
  local MSGPACK_INC
  MSGPACK_INC="$(cd ../barretenberg/cpp/build/_deps/msgpack-c/src/msgpack-c/include 2>/dev/null && pwd)" || true
  local IPC_CODEGEN_INC
  IPC_CODEGEN_INC="$(pwd)/cpp/include"
  if [ -n "${IPC_RUNTIME_SRCS:-}" ] && [ -n "${MSGPACK_INC:-}" ] && [ -d "$MSGPACK_INC" ]; then
    echo "Building C++ echo binaries..."
    # THROW/RETHROW satisfy the patched msgpack-c (-fno-exceptions support).
    local CXX_FLAGS="-std=c++20 -I $MSGPACK_INC -I $IPC_RUNTIME_INC -I $IPC_CODEGEN_INC -DMSGPACK_NO_BOOST -DMSGPACK_USE_STD_VARIANT_ADAPTOR -DTHROW=throw -DRETHROW=throw"
    (cd examples/cpp/echo && clang++ $CXX_FLAGS -o echo_server echo_server.cpp $IPC_RUNTIME_SRCS -lpthread)
    (cd examples/cpp/echo && clang++ $CXX_FLAGS -o echo_client echo_client.cpp generated/echo_ipc_client.cpp $IPC_RUNTIME_SRCS -lpthread)
  else
    echo "Skipping C++ echo build — ipc-runtime sources or msgpack-c not available"
  fi

  # NB: the golden msgpack fixtures under examples/echo-schema/golden/ are
  # COMMITTED and FROZEN — they're the binding wire-format contract. Don't
  # regenerate them here. If a deliberate wire-format change requires
  # refreshing them, run `./bootstrap.sh update_goldens` and commit the diff.
}

function update_goldens {
  echo_header "ipc-codegen update_goldens"
  # Rebuild the rust generate_golden binary first.
  (cd examples/rust/echo && cargo build --quiet --bin generate_golden)
  examples/rust/echo/target/debug/generate_golden --output-dir examples/echo-schema/golden
  echo ""
  echo "Goldens refreshed. Review the diff carefully — these are the wire-format"
  echo "contract, and any byte-level change is a breaking change for external"
  echo "implementations of the schema."
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

  # Matrix: one command per (server, client) pair over UDS.
  for server in "${matrix_langs[@]}"; do
    for client in "${matrix_langs[@]}"; do
      echo "$prefix $script matrix $server $client uds"
    done
  done

  # SHM matrix — restricted to *→ts cells. This is the only direction that
  # the ipc-runtime NAPI addon directly exercises (TS is the SHM client;
  # ipc-runtime/ts has no shm_server). The cpp/rust/zig SHM clients exist
  # but the MPSC-SHM cross-impl path between them is a separate known
  # surface that is not what this matrix is here to cover.
  # Only emit when the NAPI addon has been built — ipc-runtime/bootstrap.sh
  # produces it under ts/build/<arch>-<os>/.
  local napi_dir="$(cd ../ipc-runtime/ts 2>/dev/null && pwd)/build"
  if [ -d "$napi_dir" ] && compgen -G "$napi_dir/*/ipc_runtime_napi.node" > /dev/null; then
    for server in "${matrix_langs[@]}"; do
      [ "$server" = "ts" ] && continue
      echo "$prefix $script matrix $server ts shm"
    done
  fi
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
