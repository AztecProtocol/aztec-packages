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

  echo "Building C++ echo binaries..."
  (cd examples/cpp/echo && cmake -S . -B build && cmake --build build --target echo_server echo_client)

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
  local matrix_langs=(rust ts zig cpp)

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
