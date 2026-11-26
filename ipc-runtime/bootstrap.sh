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

"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
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

# The Node-API addon's cross builds beside this machine's in ts/build/<arch>, where native_loader.ts finds them,
# stripped, and the macOS ones re-signed (stripping invalidates their ad-hoc signature).
function stage_cross_addons {
  local arch f
  for arch in arm64-linux amd64-macos arm64-macos; do
    mkdir -p ts/build/$arch
    cp cpp/build-$arch/lib/ipc_runtime_napi.node ts/build/$arch/
  done
  llvm-strip-20 ts/build/*/*
  for arch in amd64-macos arm64-macos; do
    for f in ts/build/$arch/*; do
      ldid -S "$f"
    done
  done
}

# Stage the publishable crate, at <version>, in <dir>/ipc-runtime/rust. The
# checkout is left untouched: other projects hash these files later in the run.
# The crate compiles the C++ runtime itself, so it ships a copy of the sources.
function stage_crate {
  local version=$1 dest=$2/ipc-runtime/rust
  mkdir -p $dest/cpp
  cp -r rust/Cargo.toml rust/build.rs rust/src $dest/
  cp -r cpp/ipc_runtime $dest/cpp/
  find $dest/cpp -name '*.test.cpp' -delete
  sed -i "0,/^version = \".*\"/s//version = \"$version\"/" $dest/Cargo.toml
}

# Stage the crate for the release's publish step (bootstrap.sh publish, on the GitHub runner, which
# publishes it to crates.io before barretenberg-rs), and verify it here: packaging builds the crate
# on its own, which proves the copied sources are complete.
function release_crate {
  local version=$1 crates=${RELEASE_DIR:?RELEASE_DIR is required}/crates
  stage_crate $version $crates
  local target=$(mktemp -d)
  (cd $crates/ipc-runtime/rust && CARGO_TARGET_DIR=$target denoise "cargo package --allow-dirty")
  rm -rf $target
}

function release {
  local version=${REF_NAME#v}
  stage_cross_addons
  (cd ts && retry "deploy_npm $version")

  # Private releases also run this function but publish only to the internal
  # npm registry; crates.io is public-only.
  if "$root/scripts/assert_public_release" 2>/dev/null; then
    release_crate $version
  fi
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
