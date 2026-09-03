#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source_bootstrap
source "$root/barretenberg/cpp/scripts/pinned_chonk_inputs.sh"

if [ "${AVM:-1}" -eq "1" ]; then
  export native_preset=${NATIVE_PRESET:-clang20}
else
  export native_preset=${NATIVE_PRESET:-clang20-no-avm}
fi
export hash=$(hash_str $(../../avm-transpiler/bootstrap.sh hash) $(../../ipc-runtime/bootstrap.sh hash) $(cache_content_hash .rebuild_patterns))
export native_build_dir=$(scripts/preset-build-dir $native_preset)

# Injects version number into a given bb binary.
# Means we don't actually need to rebuild bb to release a new version if code hasn't changed.
# Uses a sentinel prefix to reliably find the version location, enabling re-injection on cached binaries.
function inject_version {
  local binary=$1
  if semver check "$REF_NAME"; then
    local version=${REF_NAME#v}
  else
    # Otherwise, use the commit hash as the version.
    local version=$(git rev-parse --short HEAD)
  fi
  local sentinel='BARRETENBERG_VERSION_SENTINEL'
  local version_space='00000000.00000000.00000000'
  if [ ${#version} -gt ${#version_space} ]; then
    echo "Error: version ($version) is longer than available space. Cannot update bb binaries." >&2
    exit 1
  fi
  # Find the sentinel and write version at the offset after it
  local sentinel_offset=$(grep -aobF "$sentinel" "$binary" 2>/dev/null | head -n 1 | cut -d: -f1)
  if [ -z "$sentinel_offset" ]; then
    echo "Warning: sentinel not found in $binary - skipping version injection (binary may be from old build)" >&2
    return 0
  fi
  # Version starts immediately after the sentinel
  local version_offset=$((sentinel_offset + ${#sentinel}))
  printf "$version\0" | dd of="$binary" bs=1 seek=$version_offset conv=notrunc 2>/dev/null

  # Re-sign after modifying the binary.
  # On macOS, use codesign. On Linux amd64, use ldid for Mach-O cross-compiled binaries.
  # ARM64 Linux instances don't need ldid — all macOS release artifacts are published from amd64.
  if [[ "$(os)" == "macos" ]]; then
    codesign -s - -f "$binary" 2>/dev/null || true
  elif [[ "$(arch)" == "amd64" ]] && llvm-objdump-20 --macho --private-header "$binary" 2>/dev/null | grep -q "Mach header"; then
    ldid -S "$binary"
  fi
}

# Inject version into all bb binaries in a directory (no-op if none exist).
function inject_bb_versions {
   local bin_dir=$1
   for f in "$bin_dir"/bb "$bin_dir"/bb.exe "$bin_dir"/bb-avm; do
     if [ -f "$f" ]; then
       inject_version "$f"
     fi
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

# Returns cache paths for a preset's build outputs.
# If preset has explicit targets: finds those specific files in bin/ and lib/.
# Otherwise: returns existing {bin,lib} dirs (catch-all).
function preset_cache_paths {
  local preset=$1
  local build_dir=$2
  local targets=$(jq -r --arg p "$preset" '
    .buildPresets[] | select(.name==$p) | .targets // [] | .[]
  ' CMakePresets.json)

  if [ -z "$targets" ]; then
    for d in $build_dir/bin $build_dir/lib; do
      [ -d "$d" ] && echo "$d"
    done
  else
    for t in $targets; do
      find $build_dir/bin $build_dir/lib \
        -maxdepth 1 \( -name "$t" -o -name "$t.exe" -o -name "$t.node" -o -name "lib${t}.a" \) \
        2>/dev/null
    done
  fi
}

# Cache-aware build: download from cache or build + upload, then inject versions.
# Usage: build_preset <preset>
function build_preset {
  set -eu
  local preset=$1
  local build_dir=$(scripts/preset-build-dir $preset)
  if ! cache_download barretenberg-$preset-$hash.zst; then
    cmake_build $preset
    cache_upload barretenberg-$preset-$hash.zst $(preset_cache_paths $preset $build_dir)
  fi
  inject_bb_versions $build_dir/bin
}

# Only check formatting if we're actually going to build (not cached).
function build_format_check {
  if ! cache_exists barretenberg-$native_preset-$hash.zst; then
    ./format.sh check
  fi
}

# Builds as many targets as possible that don't have any external dependencies, e.g. on avm_transpiler.
# Allow the build system to get a head start on compilation while building dependencies.
# This is a noop if the final artifacts exist in the cache.
function build_native_objects {
  set -eu
  if ! cache_exists barretenberg-$native_preset-$hash.zst; then
    cmake --preset "$native_preset"
    targets=$(cmake --build --preset "$native_preset" --target help | awk -F: '$1 ~ /(_objects|_tests|_bench|_gen|.a)$/ && $1 !~ /^cmake_/{print $1}' | tr '\n' ' ')
    cmake --build --preset "$native_preset" --target $targets nodejs_module
  fi
}

function build_native { build_preset $native_preset; }

function download_chonk_inputs {
  scripts/chonk_inputs.sh download
}

# Builds object files early for cross compilation (parallel with avm-transpiler).
function build_cross_objects {
  set -eu
  target=$1
  # Of the cross targets, only arm64-linux builds bb-avm, which needs the full vm2.
  local vm2_full=$([[ "$target" == arm64-linux ]] && echo vm2 || true)
  if ! cache_exists barretenberg-$target-$hash.zst; then
    cmake_build $target --target barretenberg vm2_stub vm2_sim circuit_checker honk $vm2_full
  fi
}

# Build GCC - but only syntax check.
# Note we do miss some deeper GCC checks this way, but they were as noisy
# as they were useful historically, and we have sanitizers.
function build_gcc_syntax_check_only {
  set -eu
  if cache_download barretenberg-gcc-$hash.zst; then
    return
  fi
  cmake --preset gcc -DSYNTAX_ONLY=1
  cmake --build --preset gcc --target bb
  # Note: There's no real artifact here, we fake one for consistency.
  echo success > build-gcc/syntax-check-success.flag
  cache_upload barretenberg-gcc-$hash.zst build-gcc/syntax-check-success.flag
}

# Do a basic test that the amd64-windows cross-compile preset still compiles (syntax only: no
# optimization, linking, or real artifacts). The Windows binary is otherwise only built on the
# release path, so without this PR CI misses Windows-only breakages — e.g. POSIX-only symbols
# such as SIGPIPE that are undeclared under MinGW.
function build_windows_syntax_check_only {
  set -eu
  if cache_download barretenberg-windows-syntax-$hash.zst; then
    return
  fi
  cmake --preset amd64-windows -DSYNTAX_ONLY=1
  cmake --build --preset amd64-windows
  # Note: There's no real artifact here, we fake one for consistency.
  echo success > build-amd64-windows/syntax-check-success.flag
  cache_upload barretenberg-windows-syntax-$hash.zst build-amd64-windows/syntax-check-success.flag
}

# Do basic tests that the fuzzing and fuzzing-avm presets still compile (does not do optimization or create object files).
function build_fuzzing_syntax_check_only {
  set -eu
  if cache_download barretenberg-fuzzing-$hash.zst; then
    return
  fi
  cmake --preset fuzzing -DSYNTAX_ONLY=1
  cmake --build --preset fuzzing
  cmake --preset fuzzing-avm -DSYNTAX_ONLY=1
  cmake --build --preset fuzzing-avm
  # Note: There's no real artifact here, we fake one for consistency.
  echo success > build-fuzzing/syntax-check-success.flag
  cache_upload barretenberg-fuzzing-$hash.zst build-fuzzing/syntax-check-success.flag
}

# Do basic tests that the smt preset still compiles and runs
function build_smt_verification {
  set -eu
  if cache_download barretenberg-smt-$hash.zst; then
    return
  fi

  if ! dpkg -l python3-pip python3-venv m4 bison >/dev/null 2>&1; then
    sudo apt update && sudo apt install -y python3-pip python3-venv m4 bison
  fi
  cmake --preset smt-verification

  cvc5_cmake_hash=$(cache_content_hash ^barretenberg/cpp/src/barretenberg/smt_verification/CMakeLists.txt)
  if cache_download barretenberg-cvc5-$cvc5_cmake_hash.zst; then
    # Restore machine-dependent paths after downloading cache
    find build-smt/_deps/cvc5 -type f -name "*.cmake" -exec sed -i "s|/workspace|$(pwd)|g" {} \;
  else
    cmake --build build-smt --target cvc5
    cache_upload barretenberg-cvc5-$cvc5_cmake_hash.zst build-smt/_deps/cvc5
  fi

  cmake --build build-smt --target smt_verification_tests
  cache_upload barretenberg-smt-$hash.zst build-smt
}

function build_release_dir {
  local arch=$(arch)
  rm -rf build-release
  mkdir build-release

  # Native (should be amd64-linux) builds.
  tar -czf build-release/barretenberg-$arch-linux.tar.gz -C $native_build_dir/bin bb
  tar -czf build-release/barretenberg-avm-$arch-linux.tar.gz -C $native_build_dir/bin bb-avm

  # Wasm.
  tar -czf build-release/barretenberg-wasm.tar.gz -C build-wasm/bin barretenberg.wasm
  tar -czf build-release/barretenberg-threads-wasm.tar.gz -C build-wasm-threads/bin barretenberg.wasm

  # bb cross-compiles.
  tar -czf build-release/barretenberg-arm64-linux.tar.gz -C build-arm64-linux/bin bb
  tar -czf build-release/barretenberg-arm64-darwin.tar.gz -C build-arm64-macos/bin bb
  tar -czf build-release/barretenberg-amd64-darwin.tar.gz -C build-amd64-macos/bin bb
  tar -czf build-release/barretenberg-amd64-windows.tar.gz -C build-amd64-windows/bin bb.exe

  # bb-avm cross-compiles.
  tar -czf build-release/barretenberg-avm-arm64-linux.tar.gz -C build-arm64-linux/bin bb-avm

  # Package static libraries for FFI bindings (stripped at build time via CMake POST_BUILD).
  tar -czf build-release/barretenberg-static-amd64-linux.tar.gz -C $native_build_dir/lib libbb-external.a
  tar -czf build-release/barretenberg-static-arm64-linux.tar.gz -C build-arm64-linux/lib libbb-external.a
  tar -czf build-release/barretenberg-static-amd64-darwin.tar.gz -C build-amd64-macos/lib libbb-external.a
  tar -czf build-release/barretenberg-static-arm64-darwin.tar.gz -C build-arm64-macos/lib libbb-external.a
  tar -czf build-release/barretenberg-static-amd64-windows.tar.gz -C build-amd64-windows/lib libbb-external.a
  tar -czf build-release/barretenberg-static-arm64-ios.tar.gz -C build-arm64-ios/lib libbb-external.a
  tar -czf build-release/barretenberg-static-arm64-ios-sim.tar.gz -C build-arm64-ios-sim/lib libbb-external.a
  tar -czf build-release/barretenberg-static-arm64-android.tar.gz -C build-arm64-android/lib libbb-external.a
  tar -czf build-release/barretenberg-static-x86_64-android.tar.gz -C build-x86_64-android/lib libbb-external.a
}

export -f cmake_build preset_cache_paths build_preset build_format_check build_native_objects build_cross_objects build_native download_chonk_inputs build_gcc_syntax_check_only build_fuzzing_syntax_check_only build_windows_syntax_check_only build_smt_verification inject_version inject_bb_versions

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
            echo -e "$hash:CPUS=16:MEM=32g:TIMEOUT=60m barretenberg/cpp/scripts/run_test.sh $bin_name $test"
          fi
          continue
        fi
        if [ "$mode" == nightly ]; then
          continue
        fi
        local prefix=$hash
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
    echo "$hash:CPUS=8:MEM=32g:TIMEOUT=20m barretenberg/cpp/scripts/run_test.sh bbapi_tests ChonkPinnedIvcInputsTest.AllPinnedFlows"
    echo "$hash barretenberg/cpp/scripts/chonk_inputs.sh check"
  fi
}

function test_cmds_wasm_threads {
  # Sanity check that threaded wasm ecc still works in the merge queue. Pass cores and
  # HARDWARE_CONCURRENCY into the guest so bb's wasm thread pool follows the CI budget.
  echo "$hash:CPUS=8 HARDWARE_CONCURRENCY=8 barretenberg/cpp/scripts/wasmtime.sh barretenberg/cpp/build-wasm-threads/bin/ecc_tests"
}

function test_cmds_asan {
  local prefix="$hash:CPUS=4:MEM=8g"

  # Mostly arbitrary set that touches lots of the code.
  declare -A asan_tests=(
    ["commitment_schemes_recursion_tests"]="IPARecursiveTests.AccumulationAndFullRecursiveVerifier"
    ["chonk_tests"]="ChonkTests.Basic"
    ["ultra_honk_tests"]="MegaHonkTests/0.Basic"
    ["dsl_tests"]="HonkRecursionConstraintTestWithoutPredicate/2.Tampering"
  )
  for bin_name in "${!asan_tests[@]}"; do
    local filter=${asan_tests[$bin_name]}
    echo -e "$prefix barretenberg/cpp/build-asan-fast/bin/$bin_name --gtest_filter=$filter"
  done
}

function test_cmds_smt {
  local prefix="$hash:CPUS=4:MEM=8g"
  echo -e "$prefix barretenberg/cpp/build-smt/bin/smt_verification_tests"
}

# Tests too slow to run per merge, but that we still want a daily signal on: those matching
# nightly_only_tests. Run by the ci-barretenberg-nightly job (see the repo root bootstrap.sh).
function test_cmds_nightly {
  test_cmds_native nightly
}

# Print every individual test command. Can be fed into gnu parallel.
# Paths are relative to repo root.
# We prefix the hash. This ensures the test harness and cache and skip future runs.
function test_cmds {
  if [ -z "${1:-}" ]; then
    test_cmds_native
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
function test {
  echo_header "bb test"
  test_cmds "${1:-}" | filter_test_cmds | parallelize
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
    echo "$hash:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh native $flow_dir"
    if [[ "${NO_WASM:-}" != "1" ]]; then
      echo "$hash:CPUS=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh wasm $flow_dir"
    fi
  done < <(pinned_chonk_bench_flow_names)
}

function chonk_browser_bench_cmds {
  local flow flow_dir
  while IFS= read -r flow; do
    [[ -n "$flow" ]] || continue
    flow_dir="chonk-pinned-flows/$flow"
    echo "$hash:ISOLATE=1:NET=1:CPUS=8:PARALLEL=0 barretenberg/cpp/scripts/ci_benchmark_browser_memory.sh $flow_dir"
  done < <(pinned_chonk_bench_flow_names)
}

function ultrahonk_rollup_bench_cmds {
  local inputs_dir="../../labs/yarn-project/end-to-end/ultrahonk-bench-inputs"
  local cpus
  for cpus in 8 16 32; do
    echo "$hash:CPUS=$cpus:PARALLEL=0 barretenberg/cpp/scripts/ci_benchmark_ultrahonk_circuits.sh parity_base $inputs_dir $cpus"
  done
}

function bench_cmds {
  prefix="$hash:CPUS=8"
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
  do_or_dryrun gh release upload $REF_NAME build-release/* --repo AztecProtocol/barretenberg --clobber
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
  "hash")
    echo $hash
    ;;
  *)
    default_cmd_handler "$@"
    ;;
esac
