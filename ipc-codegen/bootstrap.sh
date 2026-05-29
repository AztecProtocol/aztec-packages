#!/usr/bin/env bash
# IPC codegen package.
# Generates IPC bindings from committed JSON schemas under schemas/, in TS, C++,
# Rust and Zig. Zero npm dependencies — runs with just Node.js (v22+).
#
# The build's only direct consumer is its own cross-language test harness under
# echo_example/. Service consumers (bb, wsdb, cdb, avm) are wired up by their
# own bootstrap scripts, which invoke `ipc-codegen/bootstrap.sh build` as
# a build-time prerequisite.

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)

function build {
  echo_header "ipc-codegen build"

  # Service generation (bb, wsdb, cdb, avm) is invoked by each service's own
  # bootstrap as those consumers migrate over. The build step here invokes each
  # echo example project's own bootstrap, so every project documents and owns
  # its generation/build flow.
  (cd echo_example/cpp && ./bootstrap.sh)
  (cd echo_example/rust && ./bootstrap.sh)
  (cd echo_example/ts && ./bootstrap.sh)
  (cd echo_example/zig && ./bootstrap.sh)

  # NB: the golden msgpack fixtures under echo_example/schema/golden/ are
  # COMMITTED and FROZEN — they're the binding wire-format contract. Don't
  # regenerate them here. If a deliberate wire-format change requires
  # refreshing them, run `./bootstrap.sh update_goldens` and commit the diff.
}

function update_goldens {
  echo_header "ipc-codegen update_goldens"
  # Rebuild the rust generate_golden binary first.
  (cd echo_example/rust && cargo build --quiet --bin generate_golden)
  echo_example/rust/target/debug/generate_golden --output-dir echo_example/schema/golden
  echo ""
  echo "Goldens refreshed. Review the diff carefully — these are the wire-format"
  echo "contract, and any byte-level change is a breaking change for external"
  echo "implementations of the schema."
}

function test_cmds {
  local matrix_langs=(rust ts zig cpp)

  local prefix="$hash:CPUS=1:TIMEOUT=120s"
  local script="ipc-codegen/echo_example/scripts/run_cross_language_test.sh"

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

  # SHM matrix. Argument order is server then client. TS is only covered as a
  # client because ipc-runtime/ts has no SHM server.
  local shm_server_langs=(rust zig cpp)
  local native_shm_client_langs=(rust zig cpp)
  for server in "${shm_server_langs[@]}"; do
    for client in "${native_shm_client_langs[@]}"; do
      echo "$prefix $script matrix $server $client shm"
    done
  done

  # TS SHM client coverage requires the NAPI addon built by
  # ipc-runtime/bootstrap.sh under ts/build/<arch>-<os>/.
  local napi_dir="$(cd ../ipc-runtime/ts 2>/dev/null && pwd)/build"
  if [ -d "$napi_dir" ] && compgen -G "$napi_dir/*/ipc_runtime_napi.node" > /dev/null; then
    for server in "${shm_server_langs[@]}"; do
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
