#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap

ROOT=$(git rev-parse --show-toplevel)
BB_AVM_SIM_BINARY=bb-avm-sim
BB_AVM_SIM_PACKAGE=@aztec-foundation/bb-avm-sim
CDB_PACKAGE=@aztec-foundation/cdb
BB_JS_API_PACKAGE=@aztec-foundation/bb.js-api
WSDB_REF_PACKAGE=@aztec-foundation/wsdb-ref
WSDB_REF_ADDON=wsdb_ref_napi.node
WSDB_REF_BINARY=wsdb-ref

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
  node --experimental-strip-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/avm/avm_schema.json" \
    --lang ts \
    --package "$ROOT/barretenberg/ts/bb-avm-sim" \
    --package-name "$BB_AVM_SIM_PACKAGE" \
    --binary-name "$BB_AVM_SIM_BINARY" \
    --prefix Avm \
    --strip-method-prefix \
    --package-transports uds,wasm \
    --package-ipc-path-args 'msgpack,run,--input,{path}' \
    --package-wasm-module "bb-avm-sim.wasm=$ROOT/barretenberg/cpp/build-wasm/bin/bb-avm-sim.wasm"
}

# Server binding package for the AVM CDB protocol: generated wire types +
# Handler/dispatch + the schema itself. Pure TS — no binary, no arch packages.
function generate_cdb_package {
  node --experimental-strip-types --no-warnings \
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
#
# Generation installs the wasm builds the package ships, so they must be built first: threads
# (node, cross-origin isolated browsers) and single-thread (browsers without SharedArrayBuffer).
# Shipped uncompressed. npm tarballs are gzipped either way, so this costs nothing on install,
# and it is the form a host's own compression and the browser's compiled-code cache both want:
# only a real application/wasm response can be streamed straight into WebAssembly.compileStreaming
# and cached. A consumer serving from a host that does not compress can point bb.js's wasmPath (or
# BB_WASM_PATH) at a compressed copy instead; the loader recognises gzip.
function generate_bb_js_api_package {
  local bbapi="$ROOT/barretenberg/cpp/src/barretenberg/bbapi"
  # bb.js keeps its historical API surface (poseidon2Hash, Poseidon2Hash), so the Bb
  # service prefix is stripped from identifiers; wire tags keep it.
  node --experimental-strip-types --no-warnings \
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
    --package-wasm-module "barretenberg.wasm=$ROOT/barretenberg/cpp/build-wasm/bin/barretenberg.wasm" \
    --package-wasm-threads-module "barretenberg-threads.wasm=$ROOT/barretenberg/cpp/build-wasm-threads/bin/barretenberg.wasm"
}

# The in-memory reference world state over the node world state's contract, fully generated: a spawned
# wsdb-ref process over a socket or shared memory (node), in-process through its wasm module (node and
# browsers), or in-process through its Node-API addon (node). All three run the dispatch the bb build
# generates from the same schema (cpp/.../wsdb_ref).
function generate_wsdb_ref_package {
  node --experimental-strip-types --no-warnings \
    "$ROOT/ipc-codegen/src/generate.ts" \
    --schema "$ROOT/barretenberg/cpp/src/barretenberg/wsdb_ref/wsdb_schema.jsonc" \
    --lang ts \
    --package "$ROOT/barretenberg/ts/wsdb-ref" \
    --package-name "$WSDB_REF_PACKAGE" \
    --package-transports uds,shm,napi,wasm \
    --package-ipc-path-args 'msgpack,run,--input,{path}' \
    --binary-name "$WSDB_REF_BINARY" \
    --package-napi-addon "$WSDB_REF_ADDON" \
    --package-napi-addon-env-var WSDB_REF_NAPI_PATH \
    --package-wasm-module "wsdb-ref.wasm=$ROOT/barretenberg/cpp/build-wasm/bin/wsdb-ref.wasm"
}

# bb.js-api, bb-avm-sim, cdb and wsdb-ref are gitignored workspaces of the one yarn workspace declared in package.json,
# so `yarn install --immutable` fails against the committed lockfile unless all exist. They are generated, installed
# and compiled together: in CI an install replaces node_modules wholesale, so a build installs once, never once per
# package (and never while something else runs out of node_modules).
function generate_packages {
  generate_bb_avm_sim_package
  generate_cdb_package
  generate_bb_js_api_package
  generate_wsdb_ref_package
}

function install_and_compile_packages {
  npm_install_deps "$IPC_RUNTIME_PKG"
  yarn workspaces foreach -A -p -t \
    --include "$BB_JS_API_PACKAGE" --include "$BB_AVM_SIM_PACKAGE" \
    --include "$CDB_PACKAGE" --include "$WSDB_REF_PACKAGE" run build
}

# The C++ build directories whose binaries the packages ship, as <platform>=<build dir> lines: this machine's own
# build, or the cross builds (one named platform, or every one on an amd64 release).
function native_build_dirs {
  echo "$(arch)-$(os)=build"
}

function cross_build_dirs {
  if [ -n "${1:-}" ]; then
    echo "$1=build-$1"
  elif semver check "${REF_NAME:-}" && [ "$(arch)" == "amd64" ]; then
    local cross_arch
    for cross_arch in arm64-linux amd64-macos arm64-macos; do echo "$cross_arch=build-$cross_arch"; done
  else
    echo "This task is expected to be run with an explicit arch or in an x86 release context." >&2
  fi
}

# Stages the per-platform packages of bb.js-api (bb), bb-avm-sim and wsdb-ref (its binary and Node-API addon) from
# the C++ build directories on stdin (<platform>=<build dir> lines). The packages' prepare_arch_packages copies each
# file from where the build left it; every one must exist.
function stage_arch_packages {
  local cpp=$ROOT/barretenberg/cpp platform dir file
  local bb_js_api=() bb_avm_sim=() wsdb_ref=()
  while IFS== read -r platform dir; do
    [ -n "$platform" ] || continue
    for file in "$dir/bin/dist/bb" "$dir/bin/$BB_AVM_SIM_BINARY" "$dir/bin/$WSDB_REF_BINARY" "$dir/lib/$WSDB_REF_ADDON"; do
      [ -f "$cpp/$file" ] || { echo "stage_arch_packages: barretenberg/cpp/$file is not built" >&2; return 1; }
    done
    bb_js_api+=("$platform=$cpp/$dir/bin/dist/bb")
    bb_avm_sim+=("$platform=$cpp/$dir/bin/$BB_AVM_SIM_BINARY")
    wsdb_ref+=("$platform=$cpp/$dir/bin/$WSDB_REF_BINARY" "$platform:$WSDB_REF_ADDON=$cpp/$dir/lib/$WSDB_REF_ADDON")
  done
  [ ${#bb_js_api[@]} -gt 0 ] || return 0
  yarn workspace "$BB_JS_API_PACKAGE" run prepare_arch_packages "${bb_js_api[@]}"
  yarn workspace "$BB_AVM_SIM_PACKAGE" run prepare_arch_packages "${bb_avm_sim[@]}"
  yarn workspace "$WSDB_REF_PACKAGE" run prepare_arch_packages "${wsdb_ref[@]}"
}

# Generate + compile the packages, without bb's binaries (enough for type-checking, formatting and lint).
# Generation installs the wasm modules, so they must be built first. Not cached: it is a few seconds of tsc.
function build_packages_ts {
  generate_packages
  install_and_compile_packages
}

# The generated packages in full: compiled TS plus the wasm modules and this machine's bb, bb-avm-sim and wsdb-ref.
# bb.js and the packages' tests run these, so they are staged even when nothing else changed.
function build_packages {
  echo_header "barretenberg/ts generated packages build"
  generate_packages
  install_and_compile_packages
  native_build_dirs | stage_arch_packages
}

function build_bb_js {
  (cd bb.js && ./bootstrap.sh)
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

function build {
  build_packages
  build_bb_js
}

# `test_cmds bb_avm_sim` and `test_cmds wsdb_ref` list those packages' tests alone: they need their
# builds (bb-avm-sim, bb-wsdb-ref), which bb.js's tests do not.
function test_cmds {
  case "${1:-}" in
    bb_avm_sim)
      echo "$hash barretenberg/ts/scripts/bb_avm_sim_test.sh"
      ;;
    wsdb_ref)
      local backend
      for backend in process-uds process-shm napi wasm; do
        echo "$hash barretenberg/ts/scripts/wsdb_ref_test.sh $backend"
      done
      ;;
    *)
      (cd bb.js && ./bootstrap.sh test_cmds)
      ;;
  esac
}

function bench_cmds {
  (cd bb.js && ./bootstrap.sh bench_cmds)
}

function test {
  (cd bb.js && ./bootstrap.sh test)
}

# Stages the cross-compiled binaries into the packages that ship them (bb.js ships none of its own; the bb binary it
# runs through comes from bb.js-api). Runs after build_packages, whose install it reuses.
function cross_copy_packages {
  cross_build_dirs "$@" | stage_arch_packages
}

function cross_copy {
  cross_copy_packages "$@"
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
  if [ -d wsdb-ref ]; then
    for package_dir in wsdb-ref/packages/*; do
      [ -d "$package_dir" ] && echo "$PWD/$package_dir"
    done
    echo "$PWD/wsdb-ref"
  fi
}

function deploy_bb_js_api {
  for package_dir in bb.js-api/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd bb.js-api && retry "deploy_npm ${REF_NAME#v}")
}

function deploy_bb_avm_sim {
  for package_dir in bb-avm-sim/packages/*; do
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd bb-avm-sim && retry "deploy_npm ${REF_NAME#v}")
}

function deploy_cdb {
  (cd cdb && retry "deploy_npm ${REF_NAME#v}")
}

function deploy_wsdb_ref {
  local package_dir
  for package_dir in wsdb-ref/packages/*; do
    # A platform whose addon was not built has only the generated manifest: nothing to publish.
    [ -f "$package_dir/$WSDB_REF_ADDON" ] || continue
    (cd "$package_dir" && retry "deploy_npm ${REF_NAME#v}")
  done
  (cd wsdb-ref && retry "deploy_npm ${REF_NAME#v}")
}

# Every platform's binaries staged into the generated packages, installed and compiled once, then published. bb.js
# depends on bb.js-api, so bb.js-api is published first, with its arch packages.
function release {
  generate_packages
  install_and_compile_packages
  { native_build_dirs; cross_build_dirs; } | stage_arch_packages
  deploy_bb_js_api
  (cd bb.js && ./bootstrap.sh release)
  deploy_bb_avm_sim
  deploy_cdb
  deploy_wsdb_ref
  release_bb_bin
}

export -f generate_bb_avm_sim_package generate_cdb_package generate_bb_js_api_package generate_wsdb_ref_package
export -f generate_packages install_and_compile_packages native_build_dirs cross_build_dirs stage_arch_packages
export -f build_packages_ts build_packages build_bb_js build cross_copy_packages cross_copy
export -f release deploy_bb_js_api deploy_bb_avm_sim deploy_cdb deploy_wsdb_ref

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
