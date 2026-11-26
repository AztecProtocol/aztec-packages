#!/usr/bin/env bash
"$(git rev-parse --show-toplevel)/bootstrap.sh" init || exit 1
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap
source "$root/barretenberg/cpp/scripts/pinned_chonk_inputs.sh"

if [ "${AVM:-1}" -eq "1" ]; then
  export native_preset=${NATIVE_PRESET:-clang20}
else
  export native_preset=${NATIVE_PRESET:-clang20-no-avm}
fi
# The builds are keyed and cached by ci3 as make steps (the bb-cpp-* targets in the root Makefile), from the make
# graph; the bench commands by the bb-cpp-benches step.
bench_key=${STEP_KEY:-disabled-cache}
export native_build_dir=$(scripts/preset-build-dir $native_preset)

# The version a bb binary reports is written over a placeholder that follows a sentinel (see common/version.cpp),
# so it can be set without rebuilding.
bb_version_sentinel='BARRETENBERG_VERSION_SENTINEL'
bb_version_space='00000000.00000000.00000000'

# Writes a version into a bb binary. Returns 1 when it has no placeholder.
function set_bb_version {
  local binary=$1 version=$2
  if [ ${#version} -gt ${#bb_version_space} ]; then
    echo "Error: version ($version) is longer than available space. Cannot update bb binaries." >&2
    exit 1
  fi
  local sentinel_offset=$(grep -aobF "$bb_version_sentinel" "$binary" 2>/dev/null | head -n 1 | cut -d: -f1)
  if [ -z "$sentinel_offset" ]; then
    echo "Warning: sentinel not found in $binary - skipping version injection (binary may be from old build)" >&2
    return 1
  fi
  printf "$version\0" | dd of="$binary" bs=1 seek=$((sentinel_offset + ${#bb_version_sentinel})) conv=notrunc 2>/dev/null
}

# Re-signs a binary after it has been modified.
# On macOS, use codesign. On Linux amd64, use ldid for Mach-O cross-compiled binaries.
# ARM64 Linux instances don't need ldid — all macOS release artifacts are published from amd64.
function sign_bb_binary {
  local binary=$1
  if [[ "$(os)" == "macos" ]]; then
    codesign -s - -f "$binary" 2>/dev/null || true
  elif [[ "$(arch)" == "amd64" ]] && llvm-objdump-20 --macho --private-header "$binary" 2>/dev/null | grep -q "Mach header"; then
    ldid -S "$binary"
  fi
}

# Stamps the bb binaries a build made with a version derived from their own contents: a hash of each binary with
# its version unset. The stamp is part of the build's cached outputs, so it has to come out the same wherever the
# same binary is built: the commit (as bb used to be stamped) would make the outputs differ at every commit, so that
# nothing after bb could ever be found unchanged, and a binary restored from the cache would report the commit that
# built it. The version still changes whenever the binary does, which bb's per-version VK cache (~/.bb) relies on.
# A release's distributed copies are stamped with the release version instead (finalize_bb_binary).
function stamp_bb_versions {
  local bin_dir=$1 f version
  for f in "$bin_dir"/bb "$bin_dir"/bb.exe "$bin_dir"/bb-avm; do
    [ -f "$f" ] || continue
    set_bb_version "$f" "$bb_version_space" || continue
    version=$(sha256sum <"$f" | cut -c1-16)
    set_bb_version "$f" "$version"
    sign_bb_binary "$f"
  done
}

# Strip (llvm-strip-20 where available; bb.exe is left as built), stamp a release's version, and re-sign
# (Mach-O). Outside a release the binary keeps the version its build stamped (stamp_bb_versions). Idempotent.
function finalize_bb_binary {
  local binary=$1
  if command -v llvm-strip-20 >/dev/null 2>&1 && [[ "$binary" != *.exe ]]; then
    llvm-strip-20 "$binary"
  fi
  if semver check "$REF_NAME"; then
    set_bb_version "$binary" "${REF_NAME#v}" || true
  fi
  sign_bb_binary "$binary"
}

# The distributed copies of a build's bb, bb.exe and bb-avm: finalized into bin/dist, beside the
# unstripped originals (kept for debugging). Every channel that ships them (the GitHub release
# tarballs, the @aztec-foundation/bb and bb.js-api platform packages) copies from bin/dist, so they
# are byte-identical and report this build's version.
# Not part of the build's cached outputs (a release's version is not in their key): the Makefile runs this after
# the build's step, whether it built or restored the outputs (bb_cpp_dist).
function stage_dist_binaries {
  local bin_dir=$1
  rm -rf "$bin_dir/dist"
  local f
  for f in "$bin_dir"/bb "$bin_dir"/bb.exe "$bin_dir"/bb-avm; do
    [ -f "$f" ] || continue
    mkdir -p "$bin_dir/dist"
    cp "$f" "$bin_dir/dist/"
    finalize_bb_binary "$bin_dir/dist/$(basename "$f")"
  done
}

# Raw cmake configure + build. Internal helper.
function cmake_build {
  local preset=$1
  shift
  local cmake_args=()
  if [ "${AVM_TRANSPILER:-1}" -eq 0 ]; then
    cmake_args+=(-DAVM_TRANSPILER_LIB=)
  fi
  cmake --preset "$preset" "${cmake_args[@]}"
  cmake --build --preset "$preset" "$@"
}

# The functions below build unconditionally: each is the command of a bb-cpp-* make step in the root Makefile,
# which restores its outputs from the cache instead when it can. The cmake build dirs are those outputs, cached
# in place (their bin and lib dirs).

# Builds a preset and stamps its bb binaries' version.
function build_preset {
  set -eu
  local preset=$1
  local build_dir=$(scripts/preset-build-dir $preset)
  # bin/dist is staged after the step (stage_dist_binaries): it is not part of the outputs.
  rm -rf $build_dir/bin/dist
  cmake_build $preset
  stamp_bb_versions $build_dir/bin
}

function build_format_check {
  ./format.sh check
}

# Builds as many targets as possible that don't have any external dependencies, e.g. on avm_transpiler.
# Allow the build system to get a head start on compilation while building dependencies.
# A warm-up for build_native, which continues the same build dir: it outputs nothing, and its step only records
# that it ran.
function build_native_objects {
  set -eu
  cmake --preset "$native_preset"
  targets=$(cmake --build --preset "$native_preset" --target help | awk -F: '$1 ~ /(_objects|_tests|_bench|_gen|.a)$/ && $1 !~ /^cmake_/{print $1}' | tr '\n' ' ')
  cmake --build --preset "$native_preset" --target $targets
}

function build_native { build_preset $native_preset; }

function download_chonk_inputs {
  scripts/chonk_inputs.sh download
}

function download_ios_sdk {
  bash scripts/download-ios-sdk.sh
}

function download_android_sysroot {
  bash scripts/download-android-sysroot.sh
}

# Builds object files early for cross compilation (parallel with avm-transpiler): a warm-up for build_preset
# <target>, as build_native_objects is for build_native.
function build_cross_objects {
  set -eu
  target=$1
  # Of the cross targets, only arm64-linux builds bb-avm, which needs the full vm2.
  local vm2_full=$([[ "$target" == arm64-linux ]] && echo vm2 || true)
  cmake_build $target --target barretenberg vm2_stub vm2_sim circuit_checker honk $vm2_full
}

# Build GCC - but only syntax check.
# Note we do miss some deeper GCC checks this way, but they were as noisy
# as they were useful historically, and we have sanitizers.
function build_gcc_syntax_check_only {
  set -eu
  cmake --preset gcc -DSYNTAX_ONLY=1
  cmake --build --preset gcc --target bb
}

# Do a basic test that the amd64-windows cross-compile preset still compiles (syntax only: no
# optimization, linking, or real artifacts). The Windows binary is otherwise only built on the
# release path, so without this PR CI misses Windows-only breakages — e.g. POSIX-only symbols
# such as SIGPIPE that are undeclared under MinGW.
function build_windows_syntax_check_only {
  set -eu
  cmake --preset amd64-windows -DSYNTAX_ONLY=1
  cmake --build --preset amd64-windows
}

# Do basic tests that the fuzzing and fuzzing-avm presets still compile (does not do optimization or create object files).
function build_fuzzing_syntax_check_only {
  set -eu
  cmake --preset fuzzing -DSYNTAX_ONLY=1
  cmake --build --preset fuzzing
  cmake --preset fuzzing-avm -DSYNTAX_ONLY=1
  cmake --build --preset fuzzing-avm
}

# Do basic tests that the smt preset still compiles and runs
function build_smt_verification {
  set -eu
  if ! dpkg -l python3-pip python3-venv m4 bison >/dev/null 2>&1; then
    sudo apt update && sudo apt install -y python3-pip python3-venv m4 bison
  fi
  cmake --preset smt-verification

  # cvc5 is cached on its own, so that a change to bb does not rebuild it.
  # The cvc5 build tree records absolute paths (CMakeCache.txt, generated *.cmake files), and CMake
  # refuses to reuse it from any other directory. Key the cache on the checkout path as well, so a
  # checkout under a different directory builds and caches its own copy.
  cvc5_cmake_hash=$(hash_str \
    $(cache_content_hash ^barretenberg/cpp/src/barretenberg/smt_verification/CMakeLists.txt) "$(pwd)")
  if ! cache_download barretenberg-cvc5-$cvc5_cmake_hash.zst; then
    cmake --build build-smt --target cvc5
    cache_upload barretenberg-cvc5-$cvc5_cmake_hash.zst build-smt/_deps/cvc5
  fi

  cmake --build build-smt --target smt_verification_tests
}

# Tars one finalized binary: a stripped, version-stamped copy, identical to what the npm
# platform packages ship (barretenberg/ts/scripts/native_packages.sh verifies that).
function release_tar {
  local out=$1 src_dir=$2 name=$3
  tar -czf "$out" -C "$src_dir/dist" "$name"
}

# The GitHub release tarballs, into $STEP_OUT (ci3-out/bb-cpp-release-dir).
function build_release_dir {
  local arch=$(arch)
  local out=${STEP_OUT:?run through make: make bb-cpp-release-dir}

  # Native (should be amd64-linux) builds.
  release_tar $out/barretenberg-$arch-linux.tar.gz $native_build_dir/bin bb
  release_tar $out/barretenberg-avm-$arch-linux.tar.gz $native_build_dir/bin bb-avm

  # Wasm.
  tar -czf $out/barretenberg-wasm.tar.gz -C build-wasm/bin barretenberg.wasm
  tar -czf $out/barretenberg-threads-wasm.tar.gz -C build-wasm-threads/bin barretenberg.wasm

  # bb cross-compiles.
  release_tar $out/barretenberg-arm64-linux.tar.gz build-arm64-linux/bin bb
  release_tar $out/barretenberg-arm64-darwin.tar.gz build-arm64-macos/bin bb
  release_tar $out/barretenberg-amd64-darwin.tar.gz build-amd64-macos/bin bb
  release_tar $out/barretenberg-amd64-windows.tar.gz build-amd64-windows/bin bb.exe

  # bb-avm cross-compiles.
  release_tar $out/barretenberg-avm-arm64-linux.tar.gz build-arm64-linux/bin bb-avm

  # Package static libraries for FFI bindings (stripped at build time via CMake POST_BUILD).
  tar -czf $out/barretenberg-static-amd64-linux.tar.gz -C $native_build_dir/lib libbb-external.a
  tar -czf $out/barretenberg-static-arm64-linux.tar.gz -C build-arm64-linux/lib libbb-external.a
  tar -czf $out/barretenberg-static-amd64-darwin.tar.gz -C build-amd64-macos/lib libbb-external.a
  tar -czf $out/barretenberg-static-arm64-darwin.tar.gz -C build-arm64-macos/lib libbb-external.a
  tar -czf $out/barretenberg-static-amd64-windows.tar.gz -C build-amd64-windows/lib libbb-external.a
  tar -czf $out/barretenberg-static-arm64-ios.tar.gz -C build-arm64-ios/lib libbb-external.a
  tar -czf $out/barretenberg-static-arm64-ios-sim.tar.gz -C build-arm64-ios-sim/lib libbb-external.a
  tar -czf $out/barretenberg-static-arm64-android.tar.gz -C build-arm64-android/lib libbb-external.a
  tar -czf $out/barretenberg-static-x86_64-android.tar.gz -C build-x86_64-android/lib libbb-external.a
}

export -f cmake_build build_preset build_format_check build_native_objects build_cross_objects build_native download_chonk_inputs download_ios_sdk download_android_sysroot build_gcc_syntax_check_only build_fuzzing_syntax_check_only build_windows_syntax_check_only build_smt_verification set_bb_version sign_bb_binary stamp_bb_versions finalize_bb_binary stage_dist_binaries release_tar

function build {
  echo_header "bb cpp build"

  denoise ./scripts/remake-constants.sh

  if [ "$CI_FULL" -eq 1 ]; then
    # Deletes all build dirs and build bb and wasms from scratch.
    rm -rf build*
    (cd $root && make bb-cpp-full)
  else
    (cd $root && make bb-cpp)
  fi
}

# Tests that dominate the suite's wall time, taking tens of seconds to minutes each: the recursive verifier
# suites, whose cases build large recursion circuits, and the Chonk max capacity test, which accumulates and
# proves CHONK_MAX_NUM_APPS apps. Emitted by test_cmds_nightly rather than per merge.
#
# This includes every check on the root rollup circuit (HonkRecursionConstraintTestWithoutPredicate/2), whose
# ~6.35M gates cost 261s per merge for the pinned vk/gate-count case alone — the longest bb test in the merge
# queue for a circuit that already had its full checks deferred. Constructing it at all is the cost, so there
# is no cheap per-merge detector to keep behind: that circuit is covered nightly only.
nightly_only_tests='^(HonkRecursionConstraintTest|ChonkRecursionConstraintTest|AvmRecursionInnerCircuitTests|AvmRecursionConstraintTest|AvmRecursiveTests\.TwoLayer|PaddingVariants/AvmRecursiveTestsParameterized\.TwoLayer|BoomerangTwoLayerAvmRecursiveVerifierTests|ECCVMRecursiveTests|GoblinRecursiveVerifierTests|GoblinAvmRecursiveVerifierTests|BoomerangGoblinRecursiveVerifierTests|BoomerangGoblinAvmRecursiveVerifierTests|ChonkKernelCapacity\.MaxCapacityPassing)'

# Whether a test is left to the nightly run rather than emitted per merge.
function runs_nightly_only {
  local test=$1
  [[ "$test" =~ $nightly_only_tests ]] || return 1
  # Keep per merge: the gate count cases build a circuit once to compare against a pinned count, cheap enough
  # to serve as the per-merge detector of unintended changes to these circuits.
  [[ "$test" == *.GateCount* ]] && return 1
  # Keep in debug builds: WithoutPredicate/1.GenerateVKFromConstraints is the only case exercising the
  # debug-only native_verification_debug path in honk_recursion_constraint.cpp.
  [[ "$native_preset" == *debug* &&
     "$test" == "HonkRecursionConstraintTestWithoutPredicate/1.GenerateVKFromConstraints" ]] && return 1
  return 0
}

function test_cmds_native {
  local mode=${1:-per_merge}
  if [ "$mode" = per_merge ]; then
    local flavor_codegen_hash
    flavor_codegen_hash=$(cache_content_hash scripts/flavor-codegen \
      src/barretenberg/flavor/generated \
      src/barretenberg/honk/execution_trace/generated \
      src/barretenberg/stdlib/primitives/circuit_builders/generated \
      '^barretenberg/cpp/\.clang-format$')
    echo "$flavor_codegen_hash bash barretenberg/cpp/scripts/flavor-codegen/test.sh"
  fi

  # E.g. build, build-debug or build-coverage
  cd $native_build_dir

  for bin in ./bin/*_tests; do
    local bin_name=$(basename $bin)

    $bin --gtest_list_tests | \
      awk '/^[a-zA-Z]/ {suite=$1} /^[ ]/ {print suite$1}' | \
      grep -v 'DISABLED_' | \
      while read -r test; do
        if [[ "$test" == "ChonkPinnedIvcInputsTest.AllPinnedFlows" ]]; then
          continue
        fi
        if runs_nightly_only "$test"; then
          if [ "$mode" == nightly ]; then
            echo -e "${STEP_KEY:-disabled-cache}:CPUS=16:MEM=32g:TIMEOUT=60m barretenberg/cpp/scripts/run_test.sh $bin_name $test"
          fi
          continue
        fi
        if [ "$mode" == nightly ]; then
          continue
        fi
        local prefix=${STEP_KEY:-disabled-cache}
        # Heavy provers get more cores/memory so they finish within the default per-test timeout;
        # these circuits parallelize, so more cores lowers wall-time.
        if [[ "$test" =~ ^(AcirAvmRecursionConstraint|AvmRecursiveTests|IPARecursiveTests|HonkRecursionConstraintTest|ChonkRecursionConstraintTest) ]]; then
          # IPARecursiveTests fails with 2 threads.
          prefix="$prefix:CPUS=4:MEM=8g"
        fi
        echo -e "$prefix barretenberg/cpp/scripts/run_test.sh $bin_name $test"
      done || (echo "Failed to list tests in $bin" && exit 1)
  done

  if [ "$mode" != nightly ]; then
    echo "${STEP_KEY:-disabled-cache}:CPUS=8:MEM=32g:TIMEOUT=20m barretenberg/cpp/scripts/run_test.sh bbapi_tests ChonkPinnedIvcInputsTest.AllPinnedFlows"
    echo "${STEP_KEY:-disabled-cache} barretenberg/cpp/scripts/chonk_inputs.sh check"
    echo "${STEP_KEY:-disabled-cache} bash barretenberg/cpp/scripts/tests/chonk_inputs_test.sh"
  fi
}

function test_cmds_wasm_threads {
  # Sanity check that threaded wasm ecc still works in the merge queue. Pass cores and
  # HARDWARE_CONCURRENCY into the guest so bb's wasm thread pool follows the CI budget.
  echo "${STEP_KEY:-disabled-cache}:CPUS=8 HARDWARE_CONCURRENCY=8 barretenberg/cpp/scripts/wasmtime.sh barretenberg/cpp/build-wasm-threads/bin/ecc_tests"
}

function test_cmds_wasm {
  # The AVM simulator's in-process service, from the single-threaded build bb-avm-sim.wasm comes from. It reads
  # its fixture from the checkout, the directory wasmtime.sh preopens.
  echo "${STEP_KEY:-disabled-cache} SINGLE_THREADED=1 AZTEC_REPO_ROOT=. barretenberg/cpp/scripts/wasmtime.sh barretenberg/cpp/build-wasm/bin/avm_ffi_tests"
}

function test_cmds_asan {
  local prefix="${STEP_KEY:-disabled-cache}:CPUS=4:MEM=8g"

  # Mostly arbitrary set that touches lots of the code.
  declare -A asan_tests=(
    ["commitment_schemes_recursion_tests"]="IPARecursiveTests.AccumulationAndFullRecursiveVerifier"
    ["chonk_tests"]="ChonkTests.Basic"
    ["ultra_honk_tests"]="MegaHonkTests/0.Basic"
    ["dsl_tests"]="HonkRecursionConstraintTestWithoutPredicate/2.Tampering"
  )
  # The root rollup Tampering test takes ~250s, but over 600s when it shares the machine with the cross builds.
  declare -A asan_timeouts=(
    ["dsl_tests"]=":TIMEOUT=900s"
  )
  for bin_name in "${!asan_tests[@]}"; do
    local filter=${asan_tests[$bin_name]}
    echo -e "$prefix${asan_timeouts[$bin_name]:-} barretenberg/cpp/build-asan-fast/bin/$bin_name --gtest_filter=$filter"
  done
}

function test_cmds_smt {
  local prefix="${STEP_KEY:-disabled-cache}:CPUS=4:MEM=8g"
  echo -e "$prefix barretenberg/cpp/build-smt/bin/smt_verification_tests"
}

# Tests too slow to run per merge, but that we still want a daily signal on: those matching
# nightly_only_tests. Run by the ci-barretenberg-nightly job (see the repo root bootstrap.sh).
function test_cmds_nightly {
  test_cmds_native nightly
}

# Print every individual test command. Can be fed into gnu parallel.
# Paths are relative to repo root.
# Each is prefixed with the key of the bb-cpp-<group>-tests make step that prints it ($STEP_KEY), so the test
# cache skips a test that passed with the same inputs. Outside make (as for nightly) they are not cached.
function test_cmds {
  if [ -z "${1:-}" ]; then
    test_cmds_native
    test_cmds_wasm
    if [ "$CI_FULL" -eq 1 ]; then
      test_cmds_wasm_threads
      test_cmds_asan
      test_cmds_smt
    fi
  else
    test_cmds_$1
  fi
}

# Takes an optional test group (e.g. nightly), otherwise runs the default set.
# The groups that are make targets (bb-cpp-<group>-tests) print their commands through make, keyed by their step.
function test {
  echo_header "bb test"
  local group=${1:-}
  if [ "$group" = nightly ]; then
    test_cmds nightly | filter_test_cmds | parallelize
    return
  fi
  local targets=()
  if [ -z "$group" ]; then
    targets=(bb-cpp-native-tests bb-cpp-wasm-tests)
    if [ "$CI_FULL" -eq 1 ]; then
      targets+=(bb-cpp-wasm-threads-tests bb-cpp-asan-tests bb-cpp-smt-tests)
    fi
  else
    targets=(bb-cpp-${group//_/-}-tests)
  fi
  local cmds_file=$(mktemp)
  CI3_TEST_CMDS_FILE=$cmds_file make -C "$root" "${targets[@]}"
  parallelize <"$cmds_file"
  rm -f "$cmds_file"
}

function pinned_chonk_bench_flow_names {
  ensure_pinned_chonk_inputs "$(pinned_chonk_inputs_dir)" >&2
  list_pinned_chonk_input_flows "$(pinned_chonk_inputs_dir)"
}

function chonk_ivc_bench_cmds {
  local flow_filter="${1:-}"
  local flow flow_dir
  while IFS= read -r flow; do
    [[ -n "$flow" ]] || continue
    [[ -z "$flow_filter" || "$flow" == *"$flow_filter"* ]] || continue
    flow_dir="chonk-pinned-flows/$flow"
    echo "$bench_key:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh native $flow_dir"
    if [[ "${NO_WASM:-}" != "1" ]]; then
      echo "$bench_key:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh wasm $flow_dir"
    fi
  done < <(pinned_chonk_bench_flow_names)
}

function chonk_browser_bench_cmds {
  local flow flow_dir
  while IFS= read -r flow; do
    [[ -n "$flow" ]] || continue
    flow_dir="chonk-pinned-flows/$flow"
    echo "$bench_key:ISOLATE=1:NET=1:CPUS=8:PARALLEL=0 barretenberg/cpp/scripts/ci_benchmark_browser_memory.sh $flow_dir"
  done < <(pinned_chonk_bench_flow_names)
}

function ultrahonk_rollup_bench_cmds {
  local inputs_dir="../../labs/yarn-project/end-to-end/ultrahonk-bench-inputs"
  local cpus
  for cpus in 8 16 32; do
    echo "$bench_key:CPUS=$cpus:PARALLEL=0 barretenberg/cpp/scripts/ci_benchmark_ultrahonk_circuits.sh parity_base $inputs_dir $cpus"
  done
}

function bench_cmds {
  prefix="$bench_key:CPUS=8"
  echo "$prefix barretenberg/cpp/scripts/run_bench.sh native bb-micro-bench/native/ultra_honk $native_build_dir/bin/ultra_honk_bench construct_proof_ultrahonk_power_of_2/20$"
  echo "$prefix barretenberg/cpp/scripts/run_bench.sh native bb-micro-bench/native/ultra_honk_zk $native_build_dir/bin/ultra_honk_bench construct_proof_ultrahonk_zk_power_of_2/20$"
  echo "$prefix barretenberg/cpp/scripts/run_bench.sh wasm bb-micro-bench/wasm/ultra_honk build-wasm-threads/bin/ultra_honk_bench construct_proof_ultrahonk_power_of_2/20$"
  echo "$prefix barretenberg/cpp/scripts/run_bench.sh wasm bb-micro-bench/wasm/ultra_honk_zk build-wasm-threads/bin/ultra_honk_bench construct_proof_ultrahonk_zk_power_of_2/20$"
  chonk_ivc_bench_cmds
  chonk_browser_bench_cmds
  ultrahonk_rollup_bench_cmds
}

# Runs benchmarks sharded over machine cores.
function bench {
  echo_header "bb bench"
  rm -rf bench-out && mkdir -p bench-out
  bench_cmds | STRICT_SCHEDULING=1 parallelize
}

# Upload assets to release in AztecProtocol/barretenberg.
function release {
  echo_header "bb cpp release"
  # A private release publishes only to the internal Artifact Registry; refuse a GitHub publish
  # here regardless of call path (this function is not on the private dispatch path, but the guard
  # makes a leak impossible rather than merely unreached).
  "$root/scripts/assert_public_release"
  # The GitHub release assets are the legacy channel: the same binaries ship as npm packages
  # (@aztec-foundation/bb, @aztec-foundation/bb-avm and their platform packages) and bbup
  # installs from npm first. Kept while older bbup versions and the static libraries need it.
  do_or_dryrun gh release upload $REF_NAME ci3-out/bb-cpp-release-dir/* --repo AztecProtocol/barretenberg --clobber
}

function bench_ivc {
  # Intended only for dev usage. CI gets the same commands from bench_cmds.
  # Sample usage (CI=1 required for bench results to be visible; exclude NO_WASM=1 to run wasm benchmarks):
  # CI=1 NO_WASM=1 ./barretenberg/cpp/bootstrap.sh bench_ivc transfer_0_recursions+sponsored_fpc

  flow_filter="${1:-}" # optional string-match filter for flow names

  # Build both native and wasm benchmark binaries
  builds=(
    "cmake_build $native_preset --target bb"
  )
  if [[ "${NO_WASM:-}" != "1" ]]; then
    builds+=("cmake_build wasm-threads --target bb")
  fi
  parallel --line-buffered --tag -v denoise ::: "${builds[@]}"

  # Make sure disabling the aztec VM does not interfere with cache results from CI.
  (cd ../.. && make labs-yarn-project)

  rm -rf bench-out

  echo "Running commands:"
  chonk_ivc_bench_cmds "$flow_filter"

  chonk_ivc_bench_cmds "$flow_filter" | STRICT_SCHEDULING=1 parallelize
}

function chonk_input_update {
  echo_header "bb chonk input update"
  scripts/ci_update_chonk_inputs.sh
}

case "$cmd" in
  "")
    build
    ;;
  "ci")
    build
    test
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
