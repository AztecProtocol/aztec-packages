#!/usr/bin/env bash
# ipc-runtime — UDS + MPSC-SHM transport library for IPC services.
#
# Standalone-buildable: cmake + a C++20 compiler + POSIX is all that's
# required. No barretenberg deps, no msgpack dep, no Tracy/TBB/lmdb
# machinery. gtest is fetched via FetchContent the first time tests are
# built (cached locally between runs in cpp/build/_deps/).
#
# Cross-compile via standard CMake toolchain knobs, e.g. with zig:
#   CXX=$(git rev-parse --show-toplevel)/barretenberg/cpp/scripts/zig-c++.sh \
#   CXXFLAGS="-target aarch64-linux-gnu" \
#   ./bootstrap.sh
#
# Tests are skipped automatically when cross-compiling.

source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

hash=$(cache_content_hash .rebuild_patterns)

BUILD_DIR=${BUILD_DIR:-cpp/build}

function build {
  echo_header "ipc-runtime build"
  cmake -B "$BUILD_DIR" -S cpp -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE:-Release}
  cmake --build "$BUILD_DIR" --target ipc_runtime ipc_runtime_tests
}

function test_cmds {
  echo "$hash:CPUS=1:TIMEOUT=120s ipc-runtime/scripts/run_tests.sh"
}

function test {
  echo_header "ipc-runtime test"
  build
  "$BUILD_DIR"/ipc_runtime_tests
}

function clean {
  rm -rf "$BUILD_DIR"
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
