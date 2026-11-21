#!/usr/bin/env bash
# IPC codegen package.
# Generates IPC bindings from committed JSON schemas under schemas/, in TS, C++,
# Rust and Zig. Zero npm dependencies — runs with just Node.js (v22+).
#
# The build's only direct consumer is its own cross-language test harness under
# echo_example/. Service consumers invoke ipc-codegen from their own build
# scripts with their own schema inputs.

"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)

function build {
  echo_header "ipc-codegen build"

  # Service generation is invoked by each service's own build flow. The build
  # step here invokes each echo example project's own bootstrap, so every
  # project documents and owns its generation/build flow.
  (cd echo_example/cpp && ./bootstrap.sh)
  (cd echo_example/rust && ./bootstrap.sh)
  (cd echo_example/ts && ./bootstrap.sh)
  (cd echo_example/ts_package && ./bootstrap.sh)
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

function release {
  retry "deploy_npm ${REF_NAME#v}"
}

function test_cmds {
  local matrix_langs=(rust ts zig cpp)

  local prefix="$hash:CPUS=1:TIMEOUT=120s"
  local script="ipc-codegen/echo_example/scripts/run_cross_language_test.sh"

  # Generator unit tests (schema validation).
  echo "$prefix node --experimental-strip-types --no-warnings ipc-codegen/test/schema_visitor.test.ts"

  # The generator itself must load under type stripping alone (no transform step).
  echo "$prefix ipc-codegen/scripts/strip_only_test.sh"

  # Golden tests (each language verifies it can deserialize the goldens
  # baked by build(), and re-encode them byte-identically).
  echo "$prefix $script golden rust"
  echo "$prefix $script golden ts"
  echo "$prefix $script golden cpp"
  echo "$prefix $script golden zig"
  # The generated FFI exports, driven in-process through the generated client
  # over its FFI backend (the Rust equivalent runs as a cargo test during build()).
  echo "$prefix ipc-codegen/echo_example/cpp/build/bin/ffi_test"
  echo "$prefix ipc-codegen/echo_example/cpp/build/bin/async_relay_test"
  echo "$prefix ipc-codegen/echo_example/zig/zig-out/bin/ffi_test"
  echo "$prefix ipc-codegen/echo_example/ts_package/test.sh uds"
  echo "$prefix ipc-codegen/echo_example/ts_package/test.sh shm"
  echo "$prefix ipc-codegen/echo_example/ts_package/test.sh napi"
  echo "$prefix ipc-codegen/echo_example/ts_package/test.sh wasm"

  # Matrix. The goldens pin the wire format per language, so the matrix only has to show every
  # server answering every client language: over UDS each language serves its own client and the
  # next language's (the relay's nested hops run in every pair whose server makes host calls),
  # and over SHM each native server serves one other language, TS (through the generated SyncApi
  # and the NAPI addon) included. TS has no SHM server.
  local n=${#matrix_langs[@]}
  for ((i = 0; i < n; i++)); do
    echo "$prefix $script matrix ${matrix_langs[i]} ${matrix_langs[i]} uds"
    echo "$prefix $script matrix ${matrix_langs[i]} ${matrix_langs[(i + 1) % n]} uds"
  done
  echo "$prefix $script matrix rust cpp shm"
  echo "$prefix $script matrix cpp zig shm"
  echo "$prefix $script matrix zig rust shm"
  echo "$prefix $script matrix cpp ts shm"
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
