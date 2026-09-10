#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
BB_AVM_SIM_BINARY=bb-avm-sim
BB_AVM_SIM_PACKAGE=@aztec-foundation/bb-avm-sim
CDB_PACKAGE=@aztec-foundation/cdb
BB_JS_API_PACKAGE=@aztec-foundation/bb.js-api

hash=$(hash_str \
  $(bb.js/bootstrap.sh hash) \
  $(../cpp/bootstrap.sh hash) \
  $(../../ipc-codegen/bootstrap.sh hash) \
  $(../../ipc-runtime/bootstrap.sh hash) \
  $(cache_content_hash .rebuild_patterns) \
  $(semver check $REF_NAME && echo 1 || echo 0))

# The workspaces resolve @aztec-foundation/ipc-runtime through a portal into
# ipc-runtime/ts, so what node_modules ends up containing depends on that
# package's manifest. Include it in the node-modules cache key; without it a
# change there leaves a stale tree cached.
IPC_RUNTIME_PKG="^ipc-runtime/ts/package\.json$"

function generate_bb_avm_sim_package {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/avm/avm_schema.json" \
    --lang ts \
    --package "$ROOT/barretenberg/ts/bb-avm-sim" \
    --package-name "$BB_AVM_SIM_PACKAGE" \
    --binary-name "$BB_AVM_SIM_BINARY" \
    --prefix Avm \
    --strip-method-prefix \
    --package-transports uds \
    --package-ipc-path-args 'msgpack,run,--input,{path}'
}

# Server binding package for the AVM CDB protocol: generated wire types +
# Handler/dispatch + the schema itself. Pure TS — no binary, no arch packages.
function generate_cdb_package {
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/cdb/cdb_schema.json" \
    --lang ts \
    --server \
    --package "$ROOT/barretenberg/ts/cdb" \
    --package-name "$CDB_PACKAGE"
}

# The bb API as a generated client package: typed AsyncApi/SyncApi over bb spawned as a
# process (uds, shm) or run in-process as the wasm module (node and browsers). bb.js is
# a consumer of this package, keeping only its facades and CRS handling.
function generate_bb_js_api_package {
  local bbapi="$ROOT/barretenberg/cpp/src/barretenberg/bbapi"
  # bb.js keeps its historical API surface (poseidon2Hash, Poseidon2Hash), so the Bb
  # service prefix is stripped from identifiers; wire tags keep it.
  node --experimental-strip-types --experimental-transform-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$bbapi/bb_schema.json" \
    --lang ts \
    --package "$ROOT/barretenberg/ts/bb.js-api" \
    --package-name "$BB_JS_API_PACKAGE" \
    --binary-name bb \
    --binary-env-var BB_BINARY_PATH \
    --strip-method-prefix \
    --strip-type-prefix \
    --package-transports uds,shm,wasm \
    --package-ipc-path-args 'msgpack,run,--input,{path}' \
    --package-wasm-module barretenberg.wasm \
    --package-wasm-threads-module barretenberg-threads.wasm \
    --package-wasm-host-imports "$ROOT/barretenberg/ts/codegen/bb_wasm_host_imports.ts"
}

# bb-avm-sim, cdb and bb.js-api are gitignored workspaces declared in package.json, so
# `yarn install --immutable` fails against the committed lockfile unless all exist.
# Generate them together before installing, whichever one we're about to build.
function generate_packages {
  generate_bb_avm_sim_package
  generate_cdb_package
  generate_bb_js_api_package
}

# The wasm builds the bb.js-api package ships: threads (node, cross-origin isolated
# browsers) and single-thread (browsers without SharedArrayBuffer).
#
# Shipped uncompressed. npm tarballs are gzipped either way, so this costs nothing on install,
# and it is the form a host's own compression and the browser's compiled-code cache both want:
# only a real application/wasm response can be streamed straight into WebAssembly.compileStreaming
# and cached. A consumer serving from a host that does not compress can point bb.js's wasmPath (or
# BB_WASM_PATH) at a compressed copy instead; the loader recognises gzip.
function copy_bb_js_api_wasm {
  # Replace rather than add to: the package publishes everything under wasm/, so a module left
  # from an earlier build would ship alongside the current one.
  rm -rf bb.js-api/wasm
  mkdir -p bb.js-api/wasm
  cp "$ROOT/barretenberg/cpp/build-wasm-threads/bin/barretenberg.wasm" bb.js-api/wasm/barretenberg-threads.wasm
  cp "$ROOT/barretenberg/cpp/build-wasm/bin/barretenberg.wasm" bb.js-api/wasm/barretenberg.wasm
}

function copy_bb_js_api_native {
  local target_dir="bb.js-api/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$ROOT/barretenberg/cpp/build/bin/bb" "$target_dir/bb"
}

function copy_bb_js_api_cross {
  if [ -n "${1:-}" ]; then
    local cross_arch="$1"
    mkdir -p "bb.js-api/build/$cross_arch"
    cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/bb" "bb.js-api/build/$cross_arch/bb"
  elif semver check "${REF_NAME:-}" && [ "$(arch)" == "amd64" ]; then
    for cross_arch in arm64-linux amd64-macos arm64-macos; do
      mkdir -p "bb.js-api/build/$cross_arch"
      cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/bb" "bb.js-api/build/$cross_arch/bb"
    done
  else
    echo "This task is expected to be run with an explicit arch or in an x86 release context."
  fi
}

function prepare_bb_js_api_arch_packages {
  yarn workspace "$BB_JS_API_PACKAGE" run prepare_arch_packages "$@"
}

# Generate + compile the package bb.js compiles against, without the wasm/binary artifacts
# (enough for type-checking, formatting and lint). Not cached: it is a few seconds of tsc.
function build_bb_js_api_ts {
  generate_packages
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$BB_JS_API_PACKAGE" build
}

# The full package: compiled TS plus the wasm modules and this machine's bb binary. bb.js
# runs these at test time, so it stages them even when its own build is cached.
function build_bb_js_api {
  echo_header "bb.js-api package build"
  build_bb_js_api_ts
  copy_bb_js_api_wasm
  copy_bb_js_api_native
  prepare_bb_js_api_arch_packages "$(arch)-$(os)=build/$(arch)-$(os)/bb"
}

function copy_bb_avm_sim_native {
  local target_dir="bb-avm-sim/build/$(arch)-$(os)"
  mkdir -p "$target_dir"
  cp "$ROOT/barretenberg/cpp/build/bin/$BB_AVM_SIM_BINARY" "$target_dir/$BB_AVM_SIM_BINARY"
}

function copy_bb_avm_sim_cross {
  if [ -n "${1:-}" ]; then
    local cross_arch="$1"
    mkdir -p "bb-avm-sim/build/$cross_arch"
    cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/$BB_AVM_SIM_BINARY" \
      "bb-avm-sim/build/$cross_arch/$BB_AVM_SIM_BINARY"
  elif semver check "${REF_NAME:-}" && [ "$(arch)" == "amd64" ]; then
    for cross_arch in arm64-linux amd64-macos arm64-macos; do
      mkdir -p "bb-avm-sim/build/$cross_arch"
      cp "$ROOT/barretenberg/cpp/build-$cross_arch/bin/$BB_AVM_SIM_BINARY" \
        "bb-avm-sim/build/$cross_arch/$BB_AVM_SIM_BINARY"
    done
  else
    echo "This task is expected to be run with an explicit arch or in an x86 release context."
  fi
}

function prepare_bb_avm_sim_arch_packages {
  yarn workspace "$BB_AVM_SIM_PACKAGE" run prepare_arch_packages "$@"
}

function build_bb_js {
  (cd bb.js && ./bootstrap.sh)
}

function build_bb_avm_sim {
  echo_header "bb-avm-sim package build"
  generate_packages
  copy_bb_avm_sim_native
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$BB_AVM_SIM_PACKAGE" build
  prepare_bb_avm_sim_arch_packages "$(arch)-$(os)=build/$(arch)-$(os)/$BB_AVM_SIM_BINARY"
}

# The bb and bb-avm binaries as npm packages: a meta package per binary (@aztec-foundation/bb,
# @aztec-foundation/bb-avm) over one package per platform. Native builds stage this machine's
# platform; a release stages every platform and checks each binary against the release tarball.
function build_bb_bin {
  echo_header "bb / bb-avm npm packages"
  # Stage only this machine's platform. Every-platform staging (and the parity verify) is
  # cross_copy_bb_bin, whose target depends on the cross builds and the release dir. bb-bin
  # depends only on bb-cpp-native, so during a release (REF_NAME set) an unqualified stage would
  # select every platform and fail on cross binaries that are not built yet.
  ./scripts/native_packages.sh stage bb "$(arch)-$(os)"
  ./scripts/native_packages.sh stage bb-avm "$(arch)-$(os)"
}

function cross_copy_bb_bin {
  ./scripts/native_packages.sh stage bb "$@"
  ./scripts/native_packages.sh stage bb-avm "$@"
  if [ -d ../cpp/build-release ]; then
    ./scripts/native_packages.sh verify bb
    ./scripts/native_packages.sh verify bb-avm
  fi
}

function release_bb_bin {
  local d p staged
  for d in bb-cli bb-avm-cli; do
    staged=0
    for p in "$d"/packages/*/; do
      [ -d "$p/bin" ] || continue   # a platform not built here is not published
      (cd "$p" && retry "deploy_npm ${REF_NAME#v}")
      staged=1
    done
    # The meta package is nothing without its platform packages: its optionalDependencies would
    # every one 404. Do not publish it if none were staged (e.g. a build that never ran stage).
    [ "$staged" = 1 ] || { echo "release_bb_bin: no $d platform packages staged; skipping $d" >&2; continue; }
    (cd "$d" && retry "deploy_npm ${REF_NAME#v}")
  done
}

function build_cdb {
  echo_header "cdb package build"
  generate_packages
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$CDB_PACKAGE" build
}

function build {
  build_bb_js
  build_bb_avm_sim
  build_cdb
}

function test_cmds {
  (cd bb.js && ./bootstrap.sh test_cmds)
}

function bench_cmds {
  (cd bb.js && ./bootstrap.sh bench_cmds)
}

function test {
  (cd bb.js && ./bootstrap.sh test)
}

# bb.js's own cross copies (the LMDB NAPI module) and bb.js-api's (the bb binary), which bb.js
# runs through.
function cross_copy_bb_js {
  cross_copy_bb_js_api "$@"
  (cd bb.js && ./bootstrap.sh cross_copy "$@")
}

function cross_copy_bb_avm_sim {
  generate_packages
  copy_bb_avm_sim_cross "$@"
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$BB_AVM_SIM_PACKAGE" build
  prepare_bb_avm_sim_arch_packages
}

function cross_copy {
  cross_copy_bb_js "$@"
}

function get_projects {
  echo "$PWD/bb.js"
  if [ -d bb.js-api ]; then
    for package_dir in bb.js-api/packages/*; do
      [ -d "$package_dir" ] && echo "$PWD/$package_dir"
    done
    echo "$PWD/bb.js-api"
  fi
  if [ -d bb-avm-sim ]; then
    for package_dir in bb-avm-sim/packages/*; do
      [ -d "$package_dir" ] && echo "$PWD/$package_dir"
    done
    echo "$PWD/bb-avm-sim"
  fi
  if [ -d cdb ]; then
    echo "$PWD/cdb"
  fi
}

function release_bb_avm_sim {
  generate_packages
  copy_bb_avm_sim_native
  copy_bb_avm_sim_cross
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$BB_AVM_SIM_PACKAGE" build
  prepare_bb_avm_sim_arch_packages
  for package_dir in bb-avm-sim/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd bb-avm-sim && retry "deploy_npm ${REF_NAME#v}")
}

function release_cdb {
  generate_packages
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$CDB_PACKAGE" build
  (cd cdb && retry "deploy_npm ${REF_NAME#v}")
}

function cross_copy_bb_js_api {
  generate_packages
  copy_bb_js_api_cross "$@"
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$BB_JS_API_PACKAGE" build
  prepare_bb_js_api_arch_packages
}

# bb.js depends on bb.js-api, so it is published first (with its arch packages, the one published
# home of the bb binary).
function release_bb_js_api {
  generate_packages
  copy_bb_js_api_wasm
  copy_bb_js_api_native
  copy_bb_js_api_cross
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspace "$BB_JS_API_PACKAGE" build
  prepare_bb_js_api_arch_packages
  # The binaries come from builds keyed on source, not on the release: finalize them so they
  # carry this release's version like every other copy.
  local f
  for f in bb.js-api/packages/*/bb; do
    [ -f "$f" ] && ../cpp/bootstrap.sh finalize_bb_binary "$(realpath "$f")"
  done
  for package_dir in bb.js-api/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd bb.js-api && retry "deploy_npm ${REF_NAME#v}")
}

function release {
  release_bb_js_api
  (cd bb.js && ./bootstrap.sh release)
  release_bb_avm_sim
  release_cdb
  release_bb_bin
}

export -f generate_bb_avm_sim_package copy_bb_avm_sim_native copy_bb_avm_sim_cross generate_cdb_package generate_packages
export -f generate_bb_js_api_package copy_bb_js_api_wasm copy_bb_js_api_native copy_bb_js_api_cross prepare_bb_js_api_arch_packages build_bb_js_api_ts build_bb_js_api
export -f build_bb_js build_bb_avm_sim build_cdb build cross_copy_bb_js cross_copy_bb_avm_sim cross_copy_bb_js_api release release_cdb release_bb_js_api

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
