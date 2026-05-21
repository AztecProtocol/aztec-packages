#!/usr/bin/env bash
# ipc-runtime — UDS + MPSC-SHM transport library for IPC services.
#
# This package owns the *runtime* counterpart to ipc-codegen: where
# ipc-codegen emits protocol/dispatch/types, ipc-runtime provides the
# IpcServer / IpcClient primitives that move bytes between processes.
#
# Today the library is built and tested via barretenberg/cpp/'s CMake tree
# (which includes ipc-runtime/cpp/ as an add_subdirectory and provides
# msgpack + gtest). Standalone-buildable mode — for the foundation/labs
# split when services without barretenberg consume it — is a planned
# follow-up. For now this bootstrap delegates to barretenberg's build.

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)

function build {
  echo_header "ipc-runtime build"
  # The ipc_runtime target is part of barretenberg/cpp/'s CMake tree.
  # Build it via barretenberg's bootstrap so we inherit gtest + msgpack
  # + the toolchain settings already configured there.
  (cd ../barretenberg/cpp && cmake --preset default && cmake --build --preset default --target ipc_runtime ipc_runtime_tests)
}

function test_cmds {
  echo "$hash:CPUS=1:TIMEOUT=120s ipc-runtime/scripts/run_tests.sh"
}

function test {
  echo_header "ipc-runtime test"
  build
  ../barretenberg/cpp/build/bin/ipc_runtime_tests
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
