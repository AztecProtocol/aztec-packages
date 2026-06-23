#!/usr/bin/env bash
# ipc-runtime — UDS + MPSC-SHM transport library for IPC services.
#
# Standalone-buildable: cmake + a C++20 compiler + POSIX is all that's
# required. No repo-local deps, no msgpack dep, no tracing or database
# machinery. gtest is fetched via FetchContent the first time tests are
# built (cached locally between runs in cpp/build/_deps/).
#
# Cross-compile via standard CMake toolchain knobs, e.g. with zig:
#   CXX=zig-c++ \
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

  # Native Node addon — host-arch build. Cross-arch builds go through
  # `build_cross <arch>` against the cpp/CMakePresets.json presets.
  if [ "${SKIP_NAPI:-0}" -ne 1 ]; then
    cmake --build "$BUILD_DIR" --target ipc_runtime_napi
    local target_dir="ts/build/$(arch)-$(os)"
    mkdir -p "$target_dir"
    cp "$BUILD_DIR"/lib/ipc_runtime_napi.node "$target_dir/"
    echo "Copied NAPI addon → $target_dir/ipc_runtime_napi.node"
  fi

  # Build the TS package so file/portal-link consumers find dest/ populated
  # before they typecheck.
  if [ "${SKIP_TS_BUILD:-0}" -ne 1 ]; then
    (cd ts && yarn install --immutable && yarn build)
  fi
}

function test_cmds {
  echo "$hash:CPUS=1:TIMEOUT=120s ipc-runtime/cpp/build/ipc_runtime_tests"
  echo "$hash:CPUS=4:TIMEOUT=300s ipc-runtime/scripts/run_rust_tests.sh"
  echo "$hash:CPUS=1:TIMEOUT=120s ipc-runtime/scripts/run_ts_tests.sh"
}

function test {
  echo_header "ipc-runtime test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf "$BUILD_DIR"
}

function build_cross {
  local arch=$1
  echo_header "ipc-runtime build_cross $arch"
  (cd cpp && cmake --preset "$arch" && cmake --build --preset "$arch")
}

function cross_copy {
  ./ts/scripts/copy_cross.sh "$@"
}

function release {
  cross_copy
  cd ts
  retry "deploy_npm ${REF_NAME#v}"
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
