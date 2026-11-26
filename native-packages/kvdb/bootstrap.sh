#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
PKG="$ROOT/native-packages/kvdb"
NAPI_BINARY=nodejs_module.node


# Build the NAPI addon. kvdb is barretenberg-free: it builds and links only the lmdblib
# sibling package (+ lmdb, node-addon-api).
function build_native {
  local build_dir="cpp/build"
  CC=$(which clang) CXX=$(which clang++) cmake -S cpp -B "$build_dir" -G Ninja >/dev/null
  cmake --build "$build_dir" --target nodejs_module
  local target_dir="ts/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$build_dir/lib/$NAPI_BINARY" "$target_dir/$NAPI_BINARY"
}

# Cross-compile the addon for another platform with zig (cpp/CMakePresets.json).
function build_cross {
  local platform=$1
  echo_header "kvdb build_cross $platform"
  (cd cpp && cmake --preset "$platform" >/dev/null && cmake --build --preset "$platform")
  mkdir -p "ts/build/$platform"
  cp "cpp/build-$platform/lib/$NAPI_BINARY" "ts/build/$platform/$NAPI_BINARY"
}

# Builds unconditionally: the kvdb make step restores the TS package (ts/dest, ts/build, ts/packages) from the cache
# instead when it can.
function build_package {
  echo_header "kvdb build"
  build_native
  # Create the per-arch workspace packages BEFORE installing: npm_install_deps does
  # a clean `yarn install --immutable` on a cache miss, and the @aztec-labs/kvdb-<arch>
  # optionalDependencies must resolve to these local workspaces (not npm) or the
  # install 404s.
  (cd ts && ./scripts/prepare_arch_packages.sh "$(arch)-$(os)=build/$(arch)-$(os)/$NAPI_BINARY")
  npm_install_deps
  yarn build
}

# Through make, so the build is restored from the cache when it can be.
function build {
  make -C "$root" kvdb
}

# Emit test commands for the CI test engine: the addon's message protocol, driven over msgpack from node. Keyed by
# the kvdb-tests make step.
function test_cmds {
  echo "${STEP_KEY:-disabled-cache}:TIMEOUT=120s native-packages/kvdb/bootstrap.sh test_ts"
}

# The tests import msgpackr from the workspace's node_modules, which a build restored from the cache does not bring.
function test_ts {
  npm_install_deps
  cd ts && node --test test/*.test.mjs
}

# Manual: build then run the tests directly.
function test {
  echo_header "kvdb test"
  build
  test_cmds | filter_test_cmds | parallelize
}

function clean {
  rm -rf ts/dest ts/build ts/packages ts/node_modules node_modules cpp/build cpp/build-*
}

function release {
  build_native
  for platform in arm64-linux amd64-macos arm64-macos; do
    build_cross $platform
  done
  npm_install_deps
  yarn build
  (cd ts && ./scripts/prepare_arch_packages.sh)
  for package_dir in ts/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd ts && retry "deploy_npm ${REF_NAME#v}")
}

export -f build_native build_cross build_package build test_cmds test_ts test clean release

case "$cmd" in
  "")
    build
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
