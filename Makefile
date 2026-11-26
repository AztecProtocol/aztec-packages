# Aztec Packages Build System
#
# This Makefile is called by the root bootstrap.sh build and build_and_test functions.
# It coordinates the build order and dependencies between projects.
# The actual build logic remains in each project's bootstrap.sh script.
#
# Note that "test" targets don't *run* tests, they just output test commands to /tmp/test_cmds.
#
# Expectation is to run with one of the following targets:
# - make fast
# - make full
# - make release

# Shell to use for all commands
SHELL := /bin/bash

# Make would otherwise default to the first target in the file.
.DEFAULT_GOAL := fast

export DENOISE := 1

ROOT := $(shell git rev-parse --show-toplevel)

# Recipes call ci3 directly, so the submodules (ci3 among them) must be at their pins before any recipe
# runs, including when make is started without bootstrap.sh. A no-op when they already are.
ifneq ($(shell "$(ROOT)/bootstrap.sh" init >&2 && echo ok),ok)
$(error ./bootstrap.sh init failed)
endif

# Steps: targets ci3 keys and caches from this graph (see ci3/step.mk). Converted targets below set INPUTS and
# call step; a step's normal prerequisites are part of its key, its order-only ones (after |) only run first.
include $(ROOT)/ci3/step.mk

# The release being built, if REF_NAME is one: release builds stamp their version into what they ship, so a target
# whose outputs carry it has RELEASE_VERSION in its KEY_ENV. Not REF_NAME, which on any other build is a branch
# name and would give each branch a cache of its own.
export RELEASE_VERSION := $(shell $(ROOT)/ci3/semver check "$$REF_NAME" 2>/dev/null && echo "$$REF_NAME")

# Core helper to run a shell command with colored, prefixed output
# Usage: $(call run_command,label,directory,command)
# Color is automatically computed from label hash by color_prefix script.
# step_legacy also records the project, so that a step depending on this target is keyed by the project's
# ./bootstrap.sh hash, and in a planning run (ci3/step_plan) it runs nothing.
define run_command
	@$(ROOT)/ci3/step_legacy $(1) $(2) "$(3)"
endef

# Main build helper - calls bootstrap.sh with optional function argument
# Usage: $(call build,label,project-path[,function-name])
# label: Display name for colored output (usually the target name)
# project-path: Path to the project directory
# function-name: Optional bootstrap.sh command
define build
	$(call run_command,$(1),$(ROOT)/$(2),$(ROOT)/ci3/denoise './bootstrap.sh $(3)')
endef

# Collects the test commands from the given project, for the test engine (it reads /tmp/test_cmds).
# A test target is a ci3 step: keyed from its INPUTS and its prerequisites' outputs, which test_cmds gets as
# $STEP_KEY to prefix its commands with (see ci3/step). MAKEFILE_TARGET is set for filter_test_cmds.
define test
	$(call step_tests,$(1),$(2),$(3))
endef

#==============================================================================
# PHONY TARGETS - List every target that has a file/dir of the same name.
#==============================================================================

.PHONY: noir barretenberg noir-projects l1-contracts lmdblib kvdb wsdb

#==============================================================================
# BOOTSTRAP TARGETS
#==============================================================================

# Fast bootstrap.
# wsdb belongs to foundation until disentangled.
fast-foundation: barretenberg bb-tests \
		wsdb wsdb-tests lmdblib-tests kvdb-tests \
		l1-contracts l1-contracts-tests \
		mock-protocol-circuits \
		noir-protocol-circuits noir-protocol-circuits-tests \
		noir-protocol-circuits-variants \
		protocol-contracts protocol-contracts-tests \
		fnd-release-tests fnd-genesis-tests \
		ipc-runtime ipc-codegen-tests \
		constants-codegen constants-codegen-tests \
		labs-patches-tests \
		claude-tests \
		scripts-tests

# The labs components are built from the aztec-node checkout in the labs/ submodule, against
# this tree's packages and binaries (see the Labs section).
fast-labs: labs-fast docs-checks

fast: fast-foundation fast-labs

# Full bootstrap.
full-foundation: fast-foundation bb-full-tests bb-cpp-full

full-labs: labs-full docs docs-tests docs-examples docs-examples-tests docs-checks

full: full-foundation full-labs

# Everything required to run the full benchmark suite (see bootstrap.sh bench_cmds),
# and nothing more. bb-sol adds the Solidity gas benchmark's generated verifier;
# bb-acir builds barretenberg/acir_tests, whose headless-test harness (ts-node)
# the bb browser memory bench (ci_benchmark_browser_memory.sh) drives.
bench-foundation: bb-cpp-native bb-cpp-wasm-threads bb-ts bb-sol bb-acir wsdb \
		noir-protocol-circuits l1-contracts

bench-labs: labs-bench

# The benchmark commands, keyed like tests (ci3 step_benches): bootstrap.sh bench_cmds collects them through make.
BENCH_CMDS := bb-cpp-benches bb-ts-benches bb-sol-benches wsdb-benches noir-protocol-circuits-benches l1-contracts-benches
bench-cmds: $(BENCH_CMDS)

# The micro, Chonk IVC (native, wasm, browser) and rollup UltraHonk benches. The browser bench drives bb-acir's
# harness; the rollup bench reads labs' inputs, and keys its own cache by labs' yarn-project.
bb-cpp-benches: private INPUTS := ^barretenberg/cpp/scripts/ ^barretenberg/cpp/bootstrap\.sh$$
bb-cpp-benches: bb-cpp-native bb-cpp-wasm-threads bb-cpp-chonk-inputs bb-acir
	$(call step_benches,$@,barretenberg/cpp)

bb-ts-benches: private INPUTS := $(BB_TS_INPUTS)
bb-ts-benches: bb-ts
	$(call step_benches,$@,barretenberg/ts)

bb-sol-benches: private INPUTS := $(BB_SOL_INPUTS)
bb-sol-benches: bb-sol bb-cpp-native bb-crs
	$(call step_benches,$@,barretenberg/sol)

wsdb-benches: private INPUTS := native-packages/wsdb/.rebuild_patterns
wsdb-benches: wsdb
	$(call step_benches,$@,native-packages/wsdb)

# Keyed per circuit by the bootstrap: by the artifact and the bb binary that proves it.
noir-protocol-circuits-benches: | noir-protocol-circuits bb-cpp-native
	$(call step_benches,$@,noir-projects/fnd/noir-protocol-circuits)

l1-contracts-benches: private INPUTS := l1-contracts/.rebuild_patterns ^l1-contracts/scripts/ ^l1-contracts/test/
l1-contracts-benches: l1-contracts noir-protocol-circuits
	$(call step_benches,$@,l1-contracts)

bench: bench-foundation bench-labs

# Release. Everything plus copy bb cross compiles to ts projects.
# barretenberg/ts stages every platform's binaries into its packages in its own release step, so no cross copy here.
release-foundation: fast-foundation bb-cpp-release-dir bb-bin-cross-copy ipc-runtime-cross

release-labs: fast-labs

release: release-foundation

#==============================================================================
# Noir
#==============================================================================

# nargo, noir-execute and noir-profiler, and the noir JS packages. They stay where they are built (transitional
# path list): nargo is read from noir-repo/target/release by many scripts and the labs toolchain, and labs portals
# into noir/packages.
NOIR_OUTPUTS := $(addprefix noir-repo/target/release/,nargo noir-execute noir-profiler) packages \
  $(addprefix noir-repo/,acvm-repo/acvm_js/nodejs acvm-repo/acvm_js/web tooling/noir_codegen/lib tooling/noir_js/lib \
    tooling/noir_js_types/lib tooling/noirc_abi_wasm/nodejs tooling/noirc_abi_wasm/web)

noir: private INPUTS := noir/.rebuild_patterns ^noir/noir-repo$$ ^noir/scripts/
noir: | noir-release-check
	$(call step,$@,noir,build_noir,$(NOIR_OUTPUTS))

# On a release, checks the pinned noir release installs with noirup. Not a step: it always runs, cached or not.
noir-release-check:
	$(call build,$@,noir,release_check)

#==============================================================================
# AVM Transpiler
#==============================================================================

# Cargo builds noir's sources from the noir-repo submodule (path dependencies), not noir's build output, so
# those sources are inputs rather than the noir target a prerequisite.
AVM_TRANSPILER_INPUTS := avm-transpiler/.rebuild_patterns noir/.rebuild_patterns ^noir/noir-repo$$

# AVM_TRANSPILER=0 builds nothing.
avm-transpiler-native: private INPUTS := $(AVM_TRANSPILER_INPUTS)
avm-transpiler-native: private KEY_ENV := AVM_TRANSPILER
avm-transpiler-native:
	$(call step,$@,avm-transpiler,build_native)

avm-transpiler-cross-%: private INPUTS := $(AVM_TRANSPILER_INPUTS)
avm-transpiler-cross-%: private KEY_ENV := AVM_TRANSPILER
avm-transpiler-cross-amd64-macos:
	$(call step,$@,avm-transpiler,build_cross amd64-macos)

avm-transpiler-cross-arm64-macos:
	$(call step,$@,avm-transpiler,build_cross arm64-macos)

avm-transpiler-cross-arm64-linux:
	$(call step,$@,avm-transpiler,build_cross arm64-linux)

avm-transpiler-cross-amd64-windows:
	$(call step,$@,avm-transpiler,build_cross amd64-windows)

avm-transpiler-cross: avm-transpiler-cross-amd64-macos avm-transpiler-cross-arm64-macos avm-transpiler-cross-arm64-linux avm-transpiler-cross-amd64-windows

#==============================================================================
# Barretenberg
#==============================================================================

# Barretenberg - Aggregate target for all barretenberg sub-projects.
barretenberg: bb-cpp bb-ts-packages bb-ts bb-bin bb-rs bb-acir bb-docs bb-sol bb-bbup bb-crs

# BB C++ - Main aggregate target.
bb-cpp: bb-cpp-native bb-cpp-wasm bb-cpp-wasm-threads
	$(call step_group,$@)

# BB CRS Download. The CRS goes to ~/.bb-crs, outside the repository, so it cannot be restored from a step's
# cache: it always runs (never), and skips what is already downloaded itself. Its key covers what it downloads.
bb-crs: private INPUTS := ^barretenberg/crs/
bb-crs:
	$(call step,$@,barretenberg/crs,build,never)

# BBup - BB updater tool. Nothing to build: its tests install released binaries.
bb-bbup:
	$(call step_group,$@)

# The bb-cpp-* targets are steps. Each cmake preset builds in a build dir of its own (build, build-wasm,
# build-<target>), which local builds continue from and the rest of the repository reads in place (build/bin/bb
# above all): so a preset's step caches its bin and lib dirs in place (ci3 step's transitional path list) rather
# than installing them into $STEP_OUT.
# bb compiles ipc-runtime's C++ sources and includes avm-transpiler's C header, from their checkouts: those are
# inputs. What it links of avm-transpiler is that step's output, so avm-transpiler-native is a prerequisite.
BB_CPP_INPUTS := barretenberg/cpp/.rebuild_patterns ^ipc-runtime/cpp/ ^avm-transpiler/avm_transpiler\.h$$
bb-cpp-%: private INPUTS := $(BB_CPP_INPUTS)
# The tests read the binaries (their prerequisites' outputs), bb's scripts and the test data in its sources.
bb-cpp-%-tests: private INPUTS := barretenberg/cpp/.rebuild_patterns ^barretenberg/cpp/src/.*\.testdata\.bin$$

# The native preset, and so its build dir, follow NATIVE_PRESET and AVM (as in barretenberg/cpp/bootstrap.sh).
BB_NATIVE_PRESET := $(or $(NATIVE_PRESET),$(if $(filter 0,$(AVM)),clang20-no-avm,clang20))
BB_NATIVE_BUILD_DIR = $(shell $(ROOT)/barretenberg/cpp/scripts/preset-build-dir $(BB_NATIVE_PRESET))
BB_NATIVE_KEY_ENV := NATIVE_PRESET AVM AVM_TRANSPILER

# $(call bb_cpp_dist,<build dir>): stages a preset's distributed binaries (bin/dist: stripped, and stamped with the
# release version in a release) after its step, whether the step built the outputs or restored them. They are not
# part of the outputs: the release version is not in the key. Skipped while ci3/step_plan only works out keys.
define bb_cpp_dist
	@[ "$${CI3_KEYS_ONLY:-0}" = 1 ] || { cd $(ROOT)/barretenberg/cpp && $(ROOT)/ci3/color_prefix $@ "./bootstrap.sh stage_dist_binaries $(1)/bin"; }
endef

# Format check: a check, so the builds only run after it (order-only); its step records the pass.
bb-cpp-format-check: private INPUTS := ^barretenberg/cpp/src/.*\.(cpp|hpp|tcc)$$ ^barretenberg/cpp/\.clang-format$$ ^barretenberg/cpp/format\.sh$$
bb-cpp-format-check:
	$(call step,$@,barretenberg/cpp,build_format_check)

# BB C++ Native - Split into compilation and linking phases
# Compilation phase: Build barretenberg + vm2_sim objects (can run in parallel with avm-transpiler). A warm-up of
# the build dir bb-cpp-native continues from (order-only): it outputs nothing, and its step records that it ran, so
# it is skipped while its inputs are unchanged.
bb-cpp-native-objects: private KEY_ENV := $(BB_NATIVE_KEY_ENV)
bb-cpp-native-objects:
	$(call step,$@,barretenberg/cpp,build_native_objects)

# Linking phase: Link all native binaries (needs avm-transpiler)
bb-cpp-native: private KEY_ENV := $(BB_NATIVE_KEY_ENV)
bb-cpp-native: avm-transpiler-native | bb-cpp-native-objects bb-cpp-format-check
	$(call step,$@,barretenberg/cpp,build_native,$(BB_NATIVE_BUILD_DIR)/bin $(BB_NATIVE_BUILD_DIR)/lib)
	$(call bb_cpp_dist,$(BB_NATIVE_BUILD_DIR))

# Downloads the pinned Chonk inputs (chonk-pinned-flows), which it skips when they are already there.
bb-cpp-chonk-inputs: private INPUTS := ^barretenberg/cpp/scripts/(chonk-inputs\.hash|chonk_inputs\.sh|pinned_chonk_inputs\.sh)$$
bb-cpp-chonk-inputs:
	$(call step,$@,barretenberg/cpp,download_chonk_inputs,never)

# BB C++ WASM - Single-threaded WebAssembly build
bb-cpp-wasm:
	$(call step,$@,barretenberg/cpp,build_preset wasm,build-wasm/bin)

# BB C++ WASM Threads - Multi-threaded WebAssembly build
bb-cpp-wasm-threads:
	$(call step,$@,barretenberg/cpp,build_preset wasm-threads,build-wasm-threads/bin)

# Cross-compile object phases (parallel with avm-transpiler cross-compile): warm-ups, as bb-cpp-native-objects.
bb-cpp-cross-arm64-linux-objects bb-cpp-cross-amd64-macos-objects bb-cpp-cross-arm64-macos-objects: private KEY_ENV := AVM_TRANSPILER
bb-cpp-cross-arm64-linux-objects:
	$(call step,$@,barretenberg/cpp,build_cross_objects arm64-linux)

bb-cpp-cross-amd64-macos-objects:
	$(call step,$@,barretenberg/cpp,build_cross_objects amd64-macos)

bb-cpp-cross-arm64-macos-objects:
	$(call step,$@,barretenberg/cpp,build_cross_objects arm64-macos)

# The cross builds run one after another (order-only: none reads another's outputs), as they generate the IPC
# sources into the checkout.
bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos: private KEY_ENV := AVM_TRANSPILER

# Cross-compile for ARM64 Linux (release only)
bb-cpp-cross-arm64-linux: avm-transpiler-cross-arm64-linux | bb-cpp-native bb-cpp-cross-arm64-linux-objects
	$(call step,$@,barretenberg/cpp,build_preset arm64-linux,build-arm64-linux/bin build-arm64-linux/lib)
	$(call bb_cpp_dist,build-arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: avm-transpiler-cross-amd64-macos | bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos-objects
	$(call step,$@,barretenberg/cpp,build_preset amd64-macos,build-amd64-macos/bin build-amd64-macos/lib)
	$(call bb_cpp_dist,build-amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: avm-transpiler-cross-arm64-macos | bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos-objects
	$(call step,$@,barretenberg/cpp,build_preset arm64-macos,build-arm64-macos/bin build-arm64-macos/lib)
	$(call bb_cpp_dist,build-arm64-macos)

# Cross-compile for AMD64 Windows (release only). Its preset links no avm-transpiler.
bb-cpp-cross-amd64-windows: | bb-cpp-cross-arm64-macos
	$(call step,$@,barretenberg/cpp,build_preset amd64-windows,build-amd64-windows/bin build-amd64-windows/lib)
	$(call bb_cpp_dist,build-amd64-windows)

# iOS SDK download (shared by all iOS cross-compile targets). The script pins the version and skips the download
# when the SDK is already there.
bb-cpp-ios-sdk: private INPUTS := ^barretenberg/cpp/scripts/download-ios-sdk\.sh$$
bb-cpp-ios-sdk: private KEY_ENV := IOS_SDK_VERSION
bb-cpp-ios-sdk:
	$(call step,$@,barretenberg/cpp,download_ios_sdk,never)

# Android sysroot download (shared by all Android cross-compile targets), as bb-cpp-ios-sdk.
bb-cpp-android-sysroot: private INPUTS := ^barretenberg/cpp/scripts/download-android-sysroot\.sh$$
bb-cpp-android-sysroot:
	$(call step,$@,barretenberg/cpp,download_android_sysroot,never)

# Cross-compile for ARM64 iOS (release only, static lib only)
bb-cpp-cross-arm64-ios: bb-cpp-ios-sdk | bb-cpp-cross-amd64-windows
	$(call step,$@,barretenberg/cpp,build_preset arm64-ios,build-arm64-ios/lib)

# Cross-compile for ARM64 iOS Simulator (release only, static lib only)
bb-cpp-cross-arm64-ios-sim: bb-cpp-ios-sdk | bb-cpp-cross-arm64-ios
	$(call step,$@,barretenberg/cpp,build_preset arm64-ios-sim,build-arm64-ios-sim/lib)

# Cross-compile for ARM64 Android (release only, static lib only)
bb-cpp-cross-arm64-android: bb-cpp-android-sysroot | bb-cpp-cross-arm64-ios-sim
	$(call step,$@,barretenberg/cpp,build_preset arm64-android,build-arm64-android/lib)

# Cross-compile for x86_64 Android (release only, static lib only)
bb-cpp-cross-x86_64-android: bb-cpp-android-sysroot | bb-cpp-cross-arm64-android
	$(call step,$@,barretenberg/cpp,build_preset x86_64-android,build-x86_64-android/lib)

bb-cpp-cross: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos bb-cpp-cross-amd64-windows bb-cpp-cross-arm64-ios bb-cpp-cross-arm64-ios-sim bb-cpp-cross-arm64-android bb-cpp-cross-x86_64-android
	$(call step_group,$@)

# GCC syntax check (CI only, non-release). Checks: their steps record the pass.
bb-cpp-gcc:
	$(call step,$@,barretenberg/cpp,build_gcc_syntax_check_only)

# Fuzzing preset check (CI only, non-release)
bb-cpp-fuzzing:
	$(call step,$@,barretenberg/cpp,build_fuzzing_syntax_check_only)

# Windows cross-compile syntax check (CI only, non-release) - the Windows binary is otherwise
# only built on the release path, so this gates Windows-only breakages at PR time.
bb-cpp-windows:
	$(call step,$@,barretenberg/cpp,build_windows_syntax_check_only)

# Address sanitizer build (CI only, non-release)
bb-cpp-asan:
	$(call step,$@,barretenberg/cpp,build_preset asan-fast,build-asan-fast/bin)

# SMT verification (CI_FULL only). The tests run from the build dir, cvc5's libraries included.
bb-cpp-smt:
	$(call step,$@,barretenberg/cpp,build_smt_verification,build-smt)

# The GitHub release tarballs, in barretenberg/cpp/ci3-out/bb-cpp-release-dir. They hold the distributed binaries,
# stamped with the release version.
bb-cpp-release-dir: private INPUTS := ^barretenberg/cpp/bootstrap\.sh$$
bb-cpp-release-dir: private KEY_ENV := RELEASE_VERSION NATIVE_PRESET AVM
bb-cpp-release-dir: bb-cpp-native bb-cpp-cross bb-cpp-wasm bb-cpp-wasm-threads
	$(call step,$@,barretenberg/cpp,build_release_dir)

bb-cpp-full: bb-cpp bb-cpp-gcc bb-cpp-fuzzing bb-cpp-windows bb-cpp-asan bb-cpp-smt bb-cpp-cross-arm64-macos bb-cpp-cross-arm64-ios bb-cpp-cross-arm64-android
	$(call step_group,$@)

# The generated barretenberg/ts packages: @aztec-foundation/bb.js-api, bb-avm-sim, cdb and wsdb-ref. They are
# workspaces of one yarn workspace, so one target generates them, installs node_modules once and compiles them
# together. Generation copies in bb's wasm modules (single- and multi-threaded), and the packages ship this machine's
# bb, bb-avm-sim and wsdb-ref. The generator's sources and the schemas are inputs (barretenberg/ts/.rebuild_patterns):
# it runs from source, so ipc-codegen's own build is not a prerequisite.
# Path list: the packages are yarn workspaces, read in place through node module resolution (bb.js, acir_tests, the
# labs portals, fnd-genesis), so the generated workspace directories are cached where they are.
BB_TS_INPUTS := barretenberg/ts/.rebuild_patterns

bb-ts-packages-build: private INPUTS := $(BB_TS_INPUTS)
bb-ts-packages-build: private KEY_ENV := RELEASE_VERSION
bb-ts-packages-build: ipc-runtime bb-cpp-native bb-cpp-wasm bb-cpp-wasm-threads
	$(call step,$@,barretenberg/ts,build_packages,bb.js-api bb-avm-sim cdb wsdb-ref)

# The packages ready to use: the workspace's node_modules, which the packages, bb.js and their consumers resolve their
# dependencies from, installed every run whether or not the packages came from the cache (npm_install_deps caches
# node_modules itself, by lockfile).
bb-ts-packages: private INPUTS := $(BB_TS_INPUTS)
bb-ts-packages: bb-ts-packages-build
	$(call step,$@,barretenberg/ts,install,never)

# BB TypeScript - TypeScript bindings, over bb.js-api.
# Path list: bb.js is a yarn workspace whose dest/ is read in place through node module resolution (acir_tests, the
# labs portals).
# bb.js stamps the release version, and builds without the AVM under AVM_TRANSPILER=0.
bb-ts: private INPUTS := $(BB_TS_INPUTS)
bb-ts: private KEY_ENV := RELEASE_VERSION AVM_TRANSPILER
bb-ts: bb-ts-packages
	$(call step,$@,barretenberg/ts,build_bb_js,bb.js/dest)

# bb and bb-avm as npm packages (meta + one package per platform).
# Path list: the meta packages find their platform packages beside them in a checkout (bb-cli/platform.js), the release
# publishes them from there, and bb-bin-cross-copy stages the other platforms into the same directories.
BB_BIN_INPUTS := ^barretenberg/ts/scripts/native_packages\.sh$$ ^barretenberg/ts/bb-cli/ ^barretenberg/ts/bb-avm-cli/
BB_BIN_OUTPUTS := bb-cli/packages bb-avm-cli/packages

bb-bin: private INPUTS := $(BB_BIN_INPUTS)
bb-bin: private KEY_ENV := RELEASE_VERSION
bb-bin: bb-cpp-native
	$(call step,$@,barretenberg/ts,build_bb_bin,$(BB_BIN_OUTPUTS))

# Stages every platform and checks each binary against the release tarballs. Which platforms it stages depends on
# whether REF_NAME is a release tag, so that is part of the key.
bb-bin-cross-copy: private INPUTS := $(BB_BIN_INPUTS)
bb-bin-cross-copy: private KEY_ENV := RELEASE_VERSION
bb-bin-cross-copy: bb-bin bb-cpp-cross bb-cpp-release-dir
	$(call step,$@,barretenberg/ts,cross_copy_bb_bin,$(BB_BIN_OUTPUTS))

# BB Rust - barretenberg-rs FFI crate. It links bb's libbb-external.a, and generates its client from the bb schema
# itself (see barretenberg/rust/.rebuild_patterns), so it needs no TypeScript build.
# Path list: cargo's target/ is a working directory that the tests and the release build continue from.
bb-rs: private INPUTS := barretenberg/rust/.rebuild_patterns
bb-rs: bb-cpp-native
	$(call step,$@,barretenberg/rust,build,target/release barretenberg-rs/src/generated)

# BB ACIR Tests - ACIR compatibility tests.
# The test programs: noir's execution_success programs (from the noir-repo submodule) and the internal ones, compiled
# with nargo, the recursive ones with inputs proved by bb.
# Path list: the test scripts, benches and harnesses read each program in place, beside its sources.
bb-acir-programs: private INPUTS := barretenberg/acir_tests/.rebuild_patterns ^barretenberg/noir/ ^noir/noir-repo$$
bb-acir-programs: noir bb-cpp-native
	$(call step,$@,barretenberg/acir_tests,build_programs,acir_tests)

# The acir_tests workspace's node_modules: installed every run (npm_install_deps caches node_modules itself, by
# lockfile). It links bb.js and bb.js-api through portals, which must exist first.
bb-acir-deps: private INPUTS := ^barretenberg/acir_tests/(package\.json|yarn\.lock|[^/]+/package\.json)$$
bb-acir-deps: bb-ts-packages
	$(call step,$@,barretenberg/acir_tests,install,never)

# The browser test app (a bundle of bb.js and its wasm modules) and the bb.js test harness.
# Path list: both are yarn workspaces, whose dest/ the tests run in place.
bb-acir-js: private INPUTS := ^barretenberg/acir_tests/(browser-test-app|bbjs-test)/
bb-acir-js: bb-acir-deps bb-ts
	$(call step,$@,barretenberg/acir_tests,build_js,browser-test-app/dest bbjs-test/dest)

bb-acir: bb-acir-programs bb-acir-js
	$(call step_group,$@)

# BB Documentation. The docs site's node_modules, installed every run (npm_install_deps caches it itself): the
# build and the tests use it.
bb-docs-deps: private INPUTS := ^barretenberg/docs/(package\.json|yarn\.lock)$$
bb-docs-deps:
	$(call step,$@,barretenberg/docs,install,never)

# A check that the site builds: nothing uses what it writes (build/), so nothing is cached but its pass.
bb-docs: private INPUTS := ^barretenberg/docs/
bb-docs: bb-docs-deps
	$(call step,$@,barretenberg/docs,build)

# BB Solidity - Solidity verifier contracts, with verification keys generated by bb's honk_solidity_key_gen
# against the CRS.
# l1-contracts-solc only has to run first, so that the foundry build uses the solc binary pulled in by l1-contracts
# (see barretenberg/sol/foundry.toml, whose path names its version) rather than triggering a parallel svm download.
# Path list: forge keeps out/ and cache/ as working directories that the tests continue from, and the keys are
# generated into src/.
BB_SOL_INPUTS := ^barretenberg/sol/

bb-sol: private INPUTS := $(BB_SOL_INPUTS)
bb-sol: bb-cpp-native bb-crs | l1-contracts-solc
	$(call step,$@,barretenberg/sol,build,out cache src/honk/keys)

#==============================================================================
# Barretenberg Tests
#==============================================================================

bb-cpp-native-tests: private KEY_ENV := $(BB_NATIVE_KEY_ENV)
bb-cpp-native-tests: bb-cpp-native bb-cpp-chonk-inputs
	$(call test,$@,barretenberg/cpp,native)

bb-cpp-wasm-tests: bb-cpp-wasm
	$(call test,$@,barretenberg/cpp,wasm)

bb-cpp-wasm-threads-tests: bb-cpp-wasm-threads
	$(call test,$@,barretenberg/cpp,wasm_threads)

bb-cpp-asan-tests: bb-cpp-asan
	$(call test,$@,barretenberg/cpp,asan)

bb-cpp-smt-tests: bb-cpp-smt
	$(call test,$@,barretenberg/cpp,smt)

# The tests run bb, bb.js and the packages' native and wasm builds, as well as the programs.
bb-acir-tests: private INPUTS := ^barretenberg/acir_tests/ ^barretenberg/cpp/scripts/find-bb$$
bb-acir-tests: bb-acir bb-cpp-native bb-ts bb-ts-packages
	$(call test,$@,barretenberg/acir_tests)

# The tests are compiled into bb.js/dest, and run bb through the packages.
bb-ts-tests: private INPUTS := $(BB_TS_INPUTS) ^barretenberg/cpp/scripts/chonk_inputs\.sh$$
bb-ts-tests: bb-ts bb-ts-packages
	$(call test,$@,barretenberg/ts)

bb-avm-sim-tests: private INPUTS := $(BB_TS_INPUTS)
bb-avm-sim-tests: bb-ts-packages
	$(call test,$@,barretenberg/ts,bb_avm_sim)

bb-wsdb-ref-tests: private INPUTS := $(BB_TS_INPUTS)
bb-wsdb-ref-tests: bb-ts-packages
	$(call test,$@,barretenberg/ts,wsdb_ref)

# The differential fuzzer tests prove with bb's binaries (scripts/run_fuzzer.sh).
bb-sol-tests: private INPUTS := $(BB_SOL_INPUTS)
bb-sol-tests: bb-sol bb-cpp-native bb-crs
	$(call test,$@,barretenberg/sol)

bb-docs-tests: private INPUTS := ^barretenberg/docs/
bb-docs-tests: bb-docs
	$(call test,$@,barretenberg/docs)

bb-bbup-tests: private INPUTS := ^barretenberg/bbup/
bb-bbup-tests: bb-bbup
	$(call test,$@,barretenberg/bbup)

# The tests link libbb-external.a and spawn bb.
bb-rs-tests: private INPUTS := barretenberg/rust/.rebuild_patterns ^barretenberg/rust/scripts/
bb-rs-tests: bb-rs bb-cpp-native
	$(call test,$@,barretenberg/rust)

bb-tests: bb-cpp-native-tests bb-cpp-wasm-tests bb-acir-tests bb-ts-tests bb-avm-sim-tests bb-wsdb-ref-tests bb-sol-tests bb-bbup-tests bb-docs-tests bb-rs-tests

bb-full-tests: bb-cpp-wasm-threads-tests bb-cpp-asan-tests bb-cpp-smt-tests

#==============================================================================
# Protocol Constants Codegen
#==============================================================================

.PHONY: constants-codegen constants-codegen-tests
# The package's build embeds the protocol circuits' constants.nr. dest/ and inputs/ stay in the package (transitional
# path list): labs portals into the package directory.
CONSTANTS_CODEGEN_INPUTS := protocol/constants-codegen ^noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants\.nr$$
constants-codegen: private INPUTS := $(CONSTANTS_CODEGEN_INPUTS)
constants-codegen:
	$(call step,$@,protocol/constants-codegen,build_package,dest inputs)

constants-codegen-tests: private INPUTS := $(CONSTANTS_CODEGEN_INPUTS)
constants-codegen-tests: constants-codegen
	$(call test,$@,protocol/constants-codegen)

#==============================================================================
# IPC Codegen
#==============================================================================

# ipc-codegen's generator is source that its users run themselves (they take ipc-codegen's sources as inputs, not
# this target). What this builds is the echo example harness its tests run, which the tests read where each
# language's tool builds it (transitional path list).
.PHONY: ipc-codegen ipc-codegen-tests
# The TS examples are cached whole: what their generation and npm install write there changes with the generator.
IPC_CODEGEN_ECHO_OUTPUTS := echo_example/cpp/build/bin \
  $(addprefix echo_example/rust/target/debug/,echo_server echo_client golden_test) \
  echo_example/zig/zig-out echo_example/ts echo_example/ts_package

ipc-codegen: private INPUTS := ipc-codegen/.rebuild_patterns
ipc-codegen: ipc-runtime
	$(call step,$@,ipc-codegen,build_echo_examples,$(IPC_CODEGEN_ECHO_OUTPUTS))

ipc-codegen-tests: private INPUTS := ipc-codegen/.rebuild_patterns ^ipc-codegen/test/ ^ipc-codegen/scripts/
ipc-codegen-tests: ipc-codegen ipc-runtime
	$(call test,$@,ipc-codegen)

# The TS package's dest/ and build/ (the host NAPI addon) stay in place (transitional path list): consumers portal
# into ipc-runtime/ts. So does the C++ test binary, beside them.
.PHONY: ipc-runtime ipc-runtime-tests ipc-runtime-cross
ipc-runtime-%: private INPUTS := ipc-runtime/.rebuild_patterns
ipc-runtime: private INPUTS := ipc-runtime/.rebuild_patterns
ipc-runtime:
	$(call step,$@,ipc-runtime,build_native,ts/dest ts/build cpp/build/ipc_runtime_tests)

ipc-runtime-tests: ipc-runtime
	$(call test,$@,ipc-runtime)

# Cross-compile the NAPI addon for the 3 non-host release targets, into $STEP_OUT, where the release's
# cross_copy reads it. Host (amd64-linux) addon is produced by the standalone `ipc-runtime` target.
ipc-runtime-cross-arm64-linux:
	$(call step,$@,ipc-runtime,build_cross arm64-linux)

ipc-runtime-cross-amd64-macos:
	$(call step,$@,ipc-runtime,build_cross amd64-macos)

ipc-runtime-cross-arm64-macos:
	$(call step,$@,ipc-runtime,build_cross arm64-macos)

ipc-runtime-cross: ipc-runtime ipc-runtime-cross-arm64-linux ipc-runtime-cross-amd64-macos ipc-runtime-cross-arm64-macos
	$(call step_group,$@)

#==============================================================================
# Native packages (lmdblib, kvdb, wsdb)
#==============================================================================

# lmdblib and kvdb are barretenberg-free: they build against their own deps
# (lmdb, msgpack-c, node-addon-api) only, never bb. kvdb and wsdb compile lmdblib's sources themselves, so they take
# them as inputs rather than the lmdblib target as a prerequisite.
.PHONY: lmdblib kvdb lmdblib-tests kvdb-tests wsdb-tests
lmdblib lmdblib-tests: private INPUTS := native-packages/lmdblib/.rebuild_patterns
lmdblib:
	$(call step,$@,native-packages/lmdblib,build_native)

# kvdb's TS package (dest/, the addon in build/, the per-arch packages/) stays in place (transitional path list):
# labs portals into native-packages/kvdb/ts.
kvdb kvdb-tests: private INPUTS := native-packages/kvdb/.rebuild_patterns
kvdb:
	$(call step,$@,native-packages/kvdb,build_package,ts/dest ts/build ts/packages)

# wsdb builds barretenberg's wsdb-ref sources itself (see native-packages/wsdb/README.md), so it needs no bb build:
# those sources, ipc-runtime's C++ and ipc-codegen's generator are inputs. Its TS package is compiled against
# ipc-runtime's built TS package. The generated package (ts/) stays in place (transitional path list): labs portals
# into it. So do the test and bench binaries, beside it.
wsdb: private INPUTS := native-packages/wsdb/.rebuild_patterns barretenberg/cpp/.rebuild_patterns \
  ^barretenberg/cpp/src/barretenberg/wsdb_ref/ ^ipc-runtime/cpp/ ^ipc-codegen/src/ ^ipc-codegen/templates/
wsdb: ipc-runtime
	$(call step,$@,native-packages/wsdb,build_package,ts cpp/build/bin/wsdb_tests cpp/build/bin/wsdb_bench)

# Native-package tests. lmdblib and wsdb are self-contained gtest binaries. kvdb has no
# C++ tests: its NAPI protocol is driven from node (ts/test) and exercised further by
# yarn-project's kv-store tests. wsdb_tests use no bb headers; the bb-header
# parity/equivalence target is manual (WSDB_BUILD_BB_TESTS).
lmdblib-tests: lmdblib
	$(call test,$@,native-packages/lmdblib)

kvdb-tests: kvdb
	$(call test,$@,native-packages/kvdb)

wsdb-tests: private INPUTS := native-packages/wsdb/.rebuild_patterns
wsdb-tests: wsdb
	$(call test,$@,native-packages/wsdb)

#==============================================================================
# .claude tooling
#==============================================================================

# .codex/ mirrors .claude/ through symlinks, and agents_symlink_test checks them and the root AGENTS.md and
# CLAUDE.md links too.
.PHONY: claude-tests
claude-tests: private INPUTS := ^.*\.claude ^.*\.codex ^AGENTS\.md$$ ^CLAUDE\.md$$
claude-tests:
	$(call test,$@,.claude)

#==============================================================================
# Repository scripts
#==============================================================================

# init_test exercises the root bootstrap.sh. ci3_entrypoints_test reads every script in the repository and keys
# itself (disabled-cache).
.PHONY: scripts-tests
scripts-tests: private INPUTS := ^bootstrap\.sh$$ ^scripts/tests/
scripts-tests:
	$(call test,$@,scripts)

#==============================================================================
# Labs (aztec-node, checked out as the labs/ submodule)
#==============================================================================

# aztec-node pins released foundation packages and binaries. use-local rewrites its
# manifests to portal into this checkout and records the root in .fnd-root, so its
# components build against what this tree just built (see labs/labs-aztec-toolchain/pins.mjs).
# The rewrite is committed in the submodule as a marker commit that the patch series
# tooling ignores, so the labs tree is clean for ci3's cache hashing and yarn's immutable
# installs in CI.
LABS_DIR := $(ROOT)/labs

# What the labs manifests portal into (barretenberg/ts/*, native-packages/{wsdb,kvdb}/ts, ipc-runtime/ts,
# l1-contracts/l1-artifacts, protocol/constants-codegen, protocol/genesis, noir/packages/*) plus the
# binaries labs-aztec-toolchain symlinks (bb, bb-avm, nargo, noir-execute, noir-profiler).
# The artifacts packages' installable content is a dist/ assembled from the built circuits.
# The release flow stages it before publishing; the labs use-local portals point at the same
# dists, so they must be staged before the submodule's yarn install resolves them.
# The dists stay in place: the labs manifests portal into them (through labs-patches too), and release publishes
# from them.
fnd-artifacts-stage: private INPUTS := ^noir-projects/fnd/bootstrap\.sh$$ noir-projects/fnd/protocol-circuits-artifacts \
  noir-projects/fnd/mock-protocol-circuits-artifacts noir-projects/fnd/protocol-contracts-artifacts
fnd-artifacts-stage: noir-projects-fnd
	$(call step,$@,noir-projects/fnd,stage_packages,protocol-circuits-artifacts/dist mock-protocol-circuits-artifacts/dist protocol-contracts-artifacts/dist)

# What labs consumes from this tree: the binaries, and everything the use-local manifests portal into.
LABS_PROVIDERS := bb-cpp-native noir bb-ts l1-contracts wsdb kvdb ipc-runtime constants-codegen fnd-genesis \
  noir-projects-fnd fnd-artifacts-stage
labs-deps: $(LABS_PROVIDERS)
	$(call step_group,$@)

# Checks the submodule out at its gitlink with the labs-patches series applied (no-op when
# already there). use-local rewrites are re-done after it, so it must run first.
# A never step: apply moves the labs/ checkout itself, and is a no-op when the series is already applied.
labs-patched:
	$(call step,$@,labs-patches,apply,never)

# The tooling's sandbox lifecycle test, plus check of the committed series against the gitlink.
# After labs-patched: check must not race apply on the same submodule.
# The labs gitlink, which the series applies to, is in the key as well. Not an input pattern: labs/ sits ahead of
# its gitlink once patched, which git reports as an uncommitted change.
labs-patches-tests: private INPUTS := ^labs-patches/ ^scripts/labs_test_cmds\.sh$$ ^scripts/labs_env\.sh$$
labs-patches-tests: private KEY_SALT = $(shell git -C $(ROOT) rev-parse :labs)
labs-patches-tests: | labs-patched
	$(call test,$@,labs-patches)

# The portal resolutions change the lockfiles; they are refreshed here so the submodule's
# own installs see them consistent (yarn refuses to touch a lockfile under CI).
# scripts/labs_fnd_hashes.sh records in the submodule what ci3 hands this step for each provider (its output
# hash, or its key), which is what makes the labs cache keys (builds and tests) follow this tree.
# A never step: it rewrites the labs checkout, which is not an output to cache.
labs-use-local: $(LABS_PROVIDERS) | labs-patched
	$(call step,$@,labs-patches,use-local,never)

# ci3 takes the repo root from an inherited $$root, so the submodule's make must not see
# this tree's. The test commands it collects are relative to the submodule, and the test
# engine runs them from this root: TEST_CMD_PREFIX (inserted by labs' ci3/prefix_test_cmds)
# cds into the submodule and clears the inherited root so its ci3 re-derives it there.
# aztec-up, release-image, and the docker-compose based tests (the compose, web3signer and
# ha e2e flavours, the playground browser tests) package or mount the labs tree on its own
# (verdaccio publish, docker build context, a compose volume of the checkout) where the
# use-local portals do not resolve, so they are left to the labs repo's own CI: the targets
# are not run and the test commands are skipped.
# scripts/labs_env.sh is the single definition of that environment, shared with the
# bootstrap-side collectors (scripts/labs_test_cmds.sh).
LABS_MAKE := $(ROOT)/scripts/labs_env.sh $(MAKE)

# fast covers what a foundation change can break: labs compiled against the portals and its
# unit/e2e tests, and the contracts against this tree's nargo/bb. spartan, playground and
# the claude tooling only consume yarn-project and go in full (the pin-bump PR runs full).
LABS_FAST_GOALS := yarn-project yarn-project-tests aztec-nr noir-contracts contract-snapshots-tests
LABS_FULL_GOALS := spartan playground playground-tests claude-tests yarn-project-benches

# full runs one sub-make over both goal sets rather than chaining labs-full onto labs-fast.
# make only de-duplicates targets within a process, so a second invocation rebuilds the
# yarn-project target that every full goal depends on. That rebuild re-enters
# yarn-project/bootstrap.sh, whose clean-lite wipes the gitignored build output (dest/) and
# whose npm_install_deps re-extracts node_modules -- while the tests labs-fast already
# streamed to the concurrent test engine are still reading that tree.
labs-fast: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) $(LABS_FAST_GOALS))

labs-full: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) $(LABS_FAST_GOALS) $(LABS_FULL_GOALS))

# Just the labs yarn-project, for callers that need its build output and nothing else.
labs-yarn-project: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) yarn-project)

labs-bench: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) bench)

.PHONY: bench-cmds $(BENCH_CMDS) labs-deps labs-patched labs-patches-tests labs-use-local labs-fast labs-full labs-bench labs-yarn-project fnd-artifacts-stage

#==============================================================================
# Docs
#==============================================================================

# The docs read aztec-node through the commit docs/aztec-node.json pins, and their examples build with
# that commit's published toolchain, so nothing in this tree is a prerequisite.

# What the site's build and tests read whether or not the site comes from the cache: the pinned aztec-node
# checkout and docs/node_modules. A never step: both are local checks when already current.
docs-prep:
	$(call step,$@,docs,prep,never)

# The site, into $(STEP_OUT), and the checks of what it publishes (the aztec.js reference, orphaned URLs). Its
# inputs are docs/ and the files outside it the pages #include_code. cache_content_hash hashes contents, not
# names, so docs/'s tree id keys renamed pages; every variable that changes the output is in KEY_ENV.
docs: private INPUTS = docs/.rebuild_patterns $(shell $(ROOT)/docs/scripts/include_code_patterns.sh)
docs: private KEY_SALT = $(shell git -C $(ROOT) rev-parse HEAD:docs)
docs: private KEY_ENV := CONTEXT COMMIT_TAG RELEASE_TYPE DOCS_COMMIT NIGHTLY_TAG DEVNET_TAG TESTNET_TAG \
  MAINNET_TAG KEEP_DEVELOPER_VERSIONS
docs: | docs-prep
	$(call step,$@,docs,build)

docs-tests: private INPUTS := docs/.rebuild_patterns
docs-tests: docs | docs-prep
	$(call test,$@,docs)

# Main's examples and each dev line's, compiled and type-checked. Transitional output path: target/ is nargo's
# workspace target directory, which the examples' tests deploy from in place.
docs-examples: private INPUTS := docs/examples/.rebuild_patterns ^docs/Nargo\.toml$$ \
  ^docs/lines/.*/examples/ ^docs/lines/.*/Nargo\.toml$$ ^docs/lines/.*/aztec-node\.json$$
docs-examples:
	$(call step,$@,docs,examples,target)

docs-examples-tests: private INPUTS := docs/examples/.rebuild_patterns ^docs/Nargo\.toml$$
docs-examples-tests: docs-examples
	$(call test,$@,docs/examples)

# The docs build is full-only, so fast CI runs the docs' own checks (the pinned aztec-node
# checkout, references, Netlify shape, skills, key-shaped CLI defaults): seconds, and no labs/.
# They check that the paths the docs reference exist anywhere in the repository, so the whole tree keys them.
docs-checks: private INPUTS := docs/.rebuild_patterns
docs-checks: private KEY_SALT = $(shell git -C $(ROOT) rev-parse 'HEAD^{tree}')
docs-checks:
	$(call step,$@,docs,check)

.PHONY: docs-prep docs docs-tests docs-examples docs-examples-tests docs-checks

#==============================================================================
# Noir Projects
#==============================================================================

# The protocol circuits' project, and what its build reads beyond the project: the pattern files that choose
# each circuit's proving scheme (and so its VK).
NOIR_PROTOCOL_CIRCUITS_INPUTS := noir-projects/fnd/noir-protocol-circuits \
  ^noir-projects/fnd/chonk_circuits\.json$$ ^noir-projects/fnd/rollup_honk_circuits\.json$$

# Generates the noir-protocol-circuits workspace files (Nargo.toml, autogenerated crates),
# which are git-ignored and must exist before nargo can run in that workspace. Needs only
# yarn/node, so no prerequisites: it runs in parallel with the noir build.
# Outputs in place: nargo only finds the workspace's members where its Nargo.toml names them.
noir-protocol-circuits-variants: private INPUTS := noir-projects/fnd/noir-protocol-circuits
noir-protocol-circuits-variants:
	$(call step,$@,noir-projects/fnd/noir-protocol-circuits,generate_variants,Nargo.toml crates/autogenerated private_kernel_reset_dimensions.json)

# Format check. Must complete before the subproject builds, so a formatting error fails fast.
noir-projects-fnd-format-check: private INPUTS := ^noir-projects/fnd/bootstrap\.sh$$ noir-projects/fnd/noir-contracts \
  noir-projects/fnd/noir-protocol-circuits noir-projects/fnd/mock-protocol-circuits
noir-projects-fnd-format-check: noir noir-protocol-circuits-variants
	$(call step,$@,noir-projects/fnd,format_check)

# Caches per circuit itself (outputs never, in target/), keyed by the nargo and bb it gets as CI3_KEY_NOIR and
# CI3_KEY_BB_CPP_NATIVE. As a step its key covers what the circuits are built from, for the steps that use them.
# The format check only has to run first.
noir-protocol-circuits: private INPUTS := $(NOIR_PROTOCOL_CIRCUITS_INPUTS)
noir-protocol-circuits: noir bb-cpp-native noir-protocol-circuits-variants | noir-projects-fnd-format-check
	$(call step,$@,noir-projects/fnd/noir-protocol-circuits,build,never)

# The tests run nargo on the sources (and the generated workspace), not on the build's output: the build only
# has to come first.
noir-protocol-circuits-tests: private INPUTS := $(NOIR_PROTOCOL_CIRCUITS_INPUTS) ^noir-projects/fnd/scripts/run_test\.sh$$
noir-protocol-circuits-tests: noir noir-protocol-circuits-variants | noir-protocol-circuits
	$(call test,$@,noir-projects/fnd/noir-protocol-circuits)

# Built by noir-protocol-circuits' script, from crates that use the real circuits' types crate. Caches per
# circuit, as noir-protocol-circuits does.
mock-protocol-circuits: private INPUTS := noir-projects/fnd/mock-protocol-circuits \
  ^noir-projects/fnd/noir-protocol-circuits/bootstrap\.sh$$ noir-projects/fnd/noir-protocol-circuits/crates/types \
  ^noir-projects/fnd/chonk_circuits\.json$$ ^noir-projects/fnd/rollup_honk_circuits\.json$$
mock-protocol-circuits: noir bb-cpp-native | noir-projects-fnd-format-check
	$(call step,$@,noir-projects/fnd/mock-protocol-circuits,build,never)

# The contracts use the circuits' types crate. Caches per contract (outputs never, in target/).
PROTOCOL_CONTRACTS_INPUTS := noir-projects/fnd/noir-contracts noir-projects/fnd/noir-protocol-circuits/crates/types

protocol-contracts: private INPUTS := $(PROTOCOL_CONTRACTS_INPUTS)
protocol-contracts: noir bb-cpp-native | noir-projects-fnd-format-check
	$(call step,$@,noir-projects/fnd/noir-contracts,build,never)

# The tests run nargo on the sources, not on the build's output: the build only has to come first.
protocol-contracts-tests: private INPUTS := $(PROTOCOL_CONTRACTS_INPUTS) ^noir-projects/fnd/scripts/run_test\.sh$$
protocol-contracts-tests: noir | protocol-contracts
	$(call test,$@,noir-projects/fnd/noir-contracts)

# Everything the npm release path stages. Exists as its own target because filter_test_cmds derives
# MAKEFILE_TARGET by stripping the -tests suffix, so the stem has to name something buildable for
# grind_test to do a targeted rebuild.
fnd-release: noir-protocol-circuits mock-protocol-circuits protocol-contracts
	$(call step_group,$@)

# Smoke-tests the release path (staging plus a dry-run publish) against real build output, so a break
# surfaces on a PR rather than the first time it runs, on a release tag.
# ci3 stays whole rather than naming the scripts the release path runs, because that list is transitive: the
# release gate lives in source_bootstrap and calls semver, and deploy_npm reaches release_prep_package_json. A
# list that falls behind skips the test instead of breaking.
fnd-release-tests: private INPUTS := ^noir-projects/fnd/bootstrap\.sh$$ noir-projects/fnd/protocol-circuits-artifacts \
  noir-projects/fnd/mock-protocol-circuits-artifacts noir-projects/fnd/protocol-contracts-artifacts ^ci3/
fnd-release-tests: fnd-release
	$(call test,$@,noir-projects/fnd,release)

# Checks the committed genesis (protocol/genesis) against the protocol contracts it is derived from. The stem names
# what the check measures with, so grind_test can rebuild it.
fnd-genesis: protocol-contracts bb-ts-packages constants-codegen
	$(call step_group,$@)

fnd-genesis-tests: private INPUTS := protocol/genesis ^noir-projects/fnd/scripts/regenerate_genesis_constants\.sh$$ \
  ^noir-projects/fnd/scripts/genesis_constants\.mjs$$
fnd-genesis-tests: fnd-genesis
	$(call test,$@,noir-projects/fnd,genesis)

# These tests are not included in the dep tree.
# Rather this target must be explicitly called by bootstrap.sh after it's started the txe's.
# Only labs code needs the TXE, so the target collects the submodule's own txe tests.
noir-projects-txe-tests:
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) noir-projects-txe-tests)

# Noir Projects - Aggregate target
noir-projects-fnd: noir-protocol-circuits mock-protocol-circuits protocol-contracts
	$(call step_group,$@)

noir-projects: noir-projects-fnd
	$(call step_group,$@)

#==============================================================================
# L1 Contracts - Ethereum L1 smart contracts
#==============================================================================

# l1-contracts-solc: Download (or cache-hit) the pinned solc binary.
# This is the single owner of the svm download. Other forge projects
# (barretenberg/sol, docs/examples/solidity) point their foundry.toml at the
# same binary, so they must wait on this target before invoking forge build,
# otherwise parallel forge invocations race on ~/.svm.
# A never step: download_solc caches the binary per platform itself, at the path every foundry.toml names. Its
# key, which the steps that use it are keyed by, is the version foundry.toml pins.
l1-contracts-solc l1-contracts-prep: private INPUTS :=
l1-contracts-solc: private KEY_SALT = $(shell sed -n 's|^solc = "\./solc-\(.*\)"|\1|p' $(ROOT)/l1-contracts/foundry.toml)
l1-contracts-solc:
	$(call step,$@,l1-contracts,download_solc,never)

# l1-contracts-prep: What every l1-contracts build needs whether or not its outputs come from the cache: the
# generated constants, solc, the npm dependencies and the libraries. A never step: it produces sources in place,
# derived from the l1-contracts steps' inputs, and what is slow in it (solc, the npm install) caches itself.
l1-contracts-prep: l1-contracts-solc
	$(call step,$@,l1-contracts,prep,never)

# The steps below run after prep (order-only): what it produces is derived from their inputs, not one.
l1-contracts-%: private INPUTS := l1-contracts/.rebuild_patterns

# l1-contracts-src: Build all src/ contracts (fully independent!), into its $STEP_OUT.
l1-contracts-src: | l1-contracts-prep
	$(call step,$@,l1-contracts,build_src)

# l1-contracts-verifier: Build generated verifier and tests (depends on noir-protocol-circuits), continuing from
# l1-contracts-src's compilation. Still the output paths of ci3 step's transitional mode: forge keeps out/ and
# cache/ as the working directories that the tests, the deploy scripts they run and l1-artifacts read in place,
# and generated/ is a source directory (the @generated remapping, used by the tests, the deploy scripts and the
# published l1-artifacts bundle), so none of them can move to $STEP_OUT without every forge user moving too.
l1-contracts-verifier: noir-protocol-circuits l1-contracts-src | l1-contracts-prep
	$(call step,$@,l1-contracts,build_verifier,out cache generated)

# l1-contracts-artifacts: Generate the @aztec-foundation/l1-artifacts TS package (ABIs/bytecode/storage) and the
# self-contained foundry bundle used by the runtime forge deploy path. Must depend on the verifier, not
# just build_src: the generated artifact list includes HonkVerifier, and its real implementation is only
# produced by build_verifier (which compiles generated/HonkVerifier.sol, copied from noir-projects).
# build_src only compiles the src/ coverage mock of the same name, which collides on the same out/ path
# and would be published instead if the verifier had not run last.
# Transitional output paths: the package is a yarn workspace that yarn-project (through use-local's portal) and
# the release read in place, through its package.json exports.
l1-contracts-artifacts: l1-contracts-verifier | l1-contracts-prep
	$(call step,$@,l1-contracts,build_artifacts,l1-artifacts/dest l1-artifacts/src l1-artifacts/l1-contracts)

# l1-contracts: Complete build (aggregate target)
l1-contracts: l1-contracts-src l1-contracts-verifier l1-contracts-artifacts
	$(call step_group,$@)

# The tests read the verifier's out/, cache/ and generated/ in place, and compare generated/ with the circuits'
# verifier; besides the sources they run the scripts, the fixtures and solhint's configuration.
l1-contracts-tests: private INPUTS := l1-contracts/.rebuild_patterns ^l1-contracts/scripts/ ^l1-contracts/test/ \
  ^l1-contracts/\.solhint\.json$$
l1-contracts-tests: l1-contracts-verifier noir-protocol-circuits | l1-contracts-prep
	$(call test,$@,l1-contracts)

