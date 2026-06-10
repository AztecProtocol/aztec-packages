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

export DENOISE := 1

ROOT := $(shell git rev-parse --show-toplevel)

# Core helper to run a shell command with colored, prefixed output
# Usage: $(call run_command,label,directory,command)
# Color is automatically computed from label hash by color_prefix script
define run_command
	@cd $(2) && $(ROOT)/ci3/color_prefix $(1) "$(3)"
endef

# Main build helper - calls bootstrap.sh with optional function argument
# Usage: $(call build,label,project-path[,function-name])
# label: Display name for colored output (usually the target name)
# project-path: Path to the project directory
# function-name: Optional bootstrap.sh command
define build
	$(call run_command,$(1),$(ROOT)/$(2),$(ROOT)/ci3/denoise './bootstrap.sh $(3)')
endef

# Collects the test commands from the given project
# Writes the full output to /tmp/test_cmds atomically.
# The test engine is expected to be running and it will read commands from this file.
# MAKEFILE_TARGET is exported so filter_test_cmds can inject it into the hash prefix for targeted rebuilds.
define test
	$(call run_command,$(1),$(ROOT)/$(2),\
	  export MAKEFILE_TARGET=$(1) && ./bootstrap.sh test_cmds $(3) | $(ROOT)/ci3/filter_test_cmds | $(ROOT)/ci3/atomic_append /tmp/test_cmds)
endef

#==============================================================================
# PHONY TARGETS - List every target that has a file/dir of the same name.
#==============================================================================

.PHONY: noir barretenberg noir-projects l1-contracts release-image boxes playground docs aztec-up spartan

#==============================================================================
# BOOTSTRAP TARGETS
#==============================================================================

# Fast bootstrap.
fast: release-image barretenberg boxes playground docs aztec-up \
		  bb-tests l1-contracts-tests yarn-project-tests boxes-tests playground-tests aztec-up-tests docs-tests noir-protocol-circuits-tests contract-snapshots-tests release-image-tests spartan claude-tests

# Full bootstrap.
full: fast bb-full-tests bb-cpp-full yarn-project-benches

# Release. Everything plus copy bb cross compiles to ts projects.
release: fast bb-cpp-release-dir bb-ts-cross-copy

#==============================================================================
# Noir
#==============================================================================

noir:
	$(call build,$@,noir)

#==============================================================================
# AVM Transpiler
#==============================================================================

avm-transpiler-native:
	$(call build,$@,avm-transpiler,build_native)

avm-transpiler-cross-amd64-macos:
	$(call build,$@,avm-transpiler,build_cross amd64-macos)

avm-transpiler-cross-arm64-macos:
	$(call build,$@,avm-transpiler,build_cross arm64-macos)

avm-transpiler-cross-arm64-linux:
	$(call build,$@,avm-transpiler,build_cross arm64-linux)

avm-transpiler-cross-amd64-windows:
	$(call build,$@,avm-transpiler,build_cross amd64-windows)

avm-transpiler-cross: avm-transpiler-cross-amd64-macos avm-transpiler-cross-arm64-macos avm-transpiler-cross-arm64-linux avm-transpiler-cross-amd64-windows

#==============================================================================
# Barretenberg
#==============================================================================

# Barretenberg - Aggregate target for all barretenberg sub-projects.
barretenberg: bb-cpp bb-ts bb-rs bb-acir bb-docs bb-sol bb-bbup bb-crs

# BB C++ - Main aggregate target.
bb-cpp: bb-cpp-native bb-cpp-wasm bb-cpp-wasm-threads

# BB CRS Download
bb-crs:
	$(call build,$@,barretenberg/crs)

# BBup - BB updater tool
bb-bbup:
	$(call build,$@,barretenberg/bbup)

# Yarn install for nodejs_module (needed by presets that build nodejs_module)
bb-cpp-yarn:
	$(call run_command,$@,$(ROOT)/barretenberg/cpp,$(ROOT)/ci3/denoise 'cd src/barretenberg/nodejs_module && yarn --immutable')

# Format check (skipped if cache hit)
bb-cpp-format-check:
	$(call build,$@,barretenberg/cpp,build_format_check)

# BB C++ Native - Split into compilation and linking phases
# Compilation phase: Build barretenberg + vm2_sim objects (can run in parallel with avm-transpiler)
bb-cpp-native-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_native_objects)

# Linking phase: Link all native binaries (needs avm-transpiler)
bb-cpp-native: bb-cpp-native-objects avm-transpiler-native bb-cpp-yarn bb-cpp-format-check
	$(call build,$@,barretenberg/cpp,build_native)

bb-cpp-chonk-inputs:
	$(call build,$@,barretenberg/cpp,download_chonk_inputs)

# BB C++ WASM - Single-threaded WebAssembly build
bb-cpp-wasm:
	$(call build,$@,barretenberg/cpp,build_preset wasm)

# BB C++ WASM Threads - Multi-threaded WebAssembly build
bb-cpp-wasm-threads:
	$(call build,$@,barretenberg/cpp,build_preset wasm-threads)

# Cross-compile object phases (parallel with avm-transpiler cross-compile)
bb-cpp-cross-arm64-linux-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_cross_objects arm64-linux)

bb-cpp-cross-amd64-macos-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_cross_objects amd64-macos)

bb-cpp-cross-arm64-macos-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_cross_objects arm64-macos)

# Cross-compile for ARM64 Linux (release only)
bb-cpp-cross-arm64-linux: bb-cpp-cross-arm64-linux-objects avm-transpiler-cross-arm64-linux bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: bb-cpp-cross-amd64-macos-objects avm-transpiler-cross-amd64-macos bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: bb-cpp-cross-arm64-macos-objects avm-transpiler-cross-arm64-macos bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset arm64-macos)

# Cross-compile for AMD64 Windows (release only)
bb-cpp-cross-amd64-windows: avm-transpiler-cross-amd64-windows
	$(call build,$@,barretenberg/cpp,build_preset amd64-windows)

# iOS SDK download (shared by all iOS cross-compile targets)
bb-cpp-ios-sdk:
	$(call run_command,$@,$(ROOT)/barretenberg/cpp,bash scripts/download-ios-sdk.sh)

# Android sysroot download (shared by all Android cross-compile targets)
bb-cpp-android-sysroot:
	$(call run_command,$@,$(ROOT)/barretenberg/cpp,bash scripts/download-android-sysroot.sh)

# Cross-compile for ARM64 iOS (release only, static lib only)
bb-cpp-cross-arm64-ios: bb-cpp-ios-sdk
	$(call build,$@,barretenberg/cpp,build_preset arm64-ios)

# Cross-compile for ARM64 iOS Simulator (release only, static lib only)
bb-cpp-cross-arm64-ios-sim: bb-cpp-ios-sdk
	$(call build,$@,barretenberg/cpp,build_preset arm64-ios-sim)

# Cross-compile for ARM64 Android (release only, static lib only)
bb-cpp-cross-arm64-android: bb-cpp-android-sysroot
	$(call build,$@,barretenberg/cpp,build_preset arm64-android)

# Cross-compile for x86_64 Android (release only, static lib only)
bb-cpp-cross-x86_64-android: bb-cpp-android-sysroot
	$(call build,$@,barretenberg/cpp,build_preset x86_64-android)

bb-cpp-cross: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos bb-cpp-cross-amd64-windows bb-cpp-cross-arm64-ios bb-cpp-cross-arm64-ios-sim bb-cpp-cross-arm64-android bb-cpp-cross-x86_64-android

# GCC syntax check (CI only, non-release)
bb-cpp-gcc:
	$(call build,$@,barretenberg/cpp,build_gcc_syntax_check_only)

# Fuzzing preset check (CI only, non-release)
bb-cpp-fuzzing:
	$(call build,$@,barretenberg/cpp,build_fuzzing_syntax_check_only)

# Address sanitizer build (CI only, non-release)
bb-cpp-asan:
	$(call build,$@,barretenberg/cpp,build_preset asan-fast)

# SMT verification (CI_FULL only)
bb-cpp-smt:
	$(call build,$@,barretenberg/cpp,build_smt_verification)

bb-cpp-release-dir: bb-cpp-native bb-cpp-cross
	$(call build,$@,barretenberg/cpp,build_release_dir)

bb-cpp-full: bb-cpp bb-cpp-gcc bb-cpp-fuzzing bb-cpp-asan bb-cpp-smt bb-cpp-cross-arm64-macos bb-cpp-cross-arm64-ios bb-cpp-cross-arm64-android

# BB TypeScript - TypeScript bindings
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-native
	$(call build,$@,barretenberg/ts)

# Copies the cross-compiles into bb.js.
bb-ts-cross-copy: bb-ts bb-cpp-cross
	$(call build,$@,barretenberg/ts,cross_copy)

# BB Rust - barretenberg-rs FFI crate
bb-rs: bb-ts bb-cpp-native
	$(call build,$@,barretenberg/rust)

# BB ACIR Tests - ACIR compatibility tests
bb-acir: noir bb-cpp-native bb-ts
	$(call build,$@,barretenberg/acir_tests)

# BB Documentation
bb-docs:
	$(call build,$@,barretenberg/docs)

# BB Solidity - Solidity verifier contracts.
# Depends on l1-contracts-solc so that the foundry build uses the solc binary
# pulled in by l1-contracts (see barretenberg/sol/foundry.toml) rather than
# triggering a parallel svm download.
bb-sol: bb-cpp-native bb-crs l1-contracts-solc
	$(call build,$@,barretenberg/sol)

#==============================================================================
# Barretenberg Tests
#==============================================================================

bb-cpp-native-tests: bb-cpp-native bb-cpp-chonk-inputs
	$(call test,$@,barretenberg/cpp,native)

bb-cpp-wasm-threads-tests: bb-cpp-wasm-threads
	$(call test,$@,barretenberg/cpp,wasm_threads)

bb-cpp-asan-tests: bb-cpp-asan
	$(call test,$@,barretenberg/cpp,asan)

bb-cpp-smt-tests: bb-cpp-smt
	$(call test,$@,barretenberg/cpp,smt)

bb-acir-tests: bb-acir
	$(call test,$@,barretenberg/acir_tests)

bb-ts-tests: bb-ts
	$(call test,$@,barretenberg/ts)

bb-sol-tests: bb-sol
	$(call test,$@,barretenberg/sol)

bb-docs-tests: bb-docs
	$(call test,$@,barretenberg/docs)

bb-bbup-tests: bb-bbup
	$(call test,$@,barretenberg/bbup)

bb-rs-tests: bb-rs
	$(call test,$@,barretenberg/rust)

bb-tests: bb-cpp-native-tests bb-acir-tests bb-ts-tests bb-sol-tests bb-bbup-tests bb-docs-tests bb-rs-tests

bb-full-tests: bb-cpp-wasm-threads-tests bb-cpp-asan-tests bb-cpp-smt-tests

#==============================================================================
# .claude tooling
#==============================================================================

.PHONY: claude-tests
claude-tests:
	$(call test,$@,.claude)

#==============================================================================
# Noir Projects
#==============================================================================

# Format check. Also warms the nargo dependency cache, so it must complete before the
# subproject builds to avoid parallel nargo runs tripping over each other downloading.
noir-projects-format-check: noir
	$(call build,$@,noir-projects,format_check)

noir-protocol-circuits: noir bb-cpp-native noir-projects-format-check
	$(call build,$@,noir-projects/noir-protocol-circuits)

noir-protocol-circuits-tests: noir noir-protocol-circuits
	$(call test,$@,noir-projects/noir-protocol-circuits)

mock-protocol-circuits: noir bb-cpp-native noir-projects-format-check
	$(call build,$@,noir-projects/mock-protocol-circuits)

noir-contracts: noir bb-cpp-native noir-projects-format-check
	$(call build,$@,noir-projects/noir-contracts)

aztec-nr: noir bb-cpp-native noir-projects-format-check
	$(call build,$@,noir-projects/aztec-nr)

# These tests are not included in the dep tree.
# Rather this target must be explicitly called by bootstrap.sh after it's started the txe's.
noir-projects-txe-tests:
	$(call test,$@,noir-projects/aztec-nr)
	$(call test,$@,noir-projects/noir-contracts)

contract-snapshots-tests: noir
	$(call test,$@,noir-projects/contract-snapshots)

# Noir Projects - Aggregate target (builds all sub-projects)
noir-projects: noir-protocol-circuits mock-protocol-circuits noir-contracts aztec-nr

#==============================================================================
# L1 Contracts - Ethereum L1 smart contracts
#==============================================================================

# l1-contracts-solc: Download (or cache-hit) the pinned solc binary.
# This is the single owner of the svm download. Other forge projects
# (barretenberg/sol, docs/examples/solidity) point their foundry.toml at the
# same binary, so they must wait on this target before invoking forge build,
# otherwise parallel forge invocations race on ~/.svm.
l1-contracts-solc:
	$(call build,$@,l1-contracts,download_solc)

# l1-contracts-src: Build all src/ contracts (fully independent!)
l1-contracts-src: l1-contracts-solc
	$(call build,$@,l1-contracts,build_src)

# l1-contracts-verifier: Build generated verifier and tests (depends on noir-protocol-circuits)
l1-contracts-verifier: noir-protocol-circuits l1-contracts-src
	$(call build,$@,l1-contracts,build_verifier)

# l1-contracts: Complete build (aggregate target)
l1-contracts: l1-contracts-src l1-contracts-verifier

l1-contracts-tests: l1-contracts-verifier
	$(call test,$@,l1-contracts)

#==============================================================================
# Yarn Project - TypeScript monorepo with all TS packages
#==============================================================================

yarn-project: bb-ts noir-projects l1-contracts
	$(call build,$@,yarn-project)

yarn-project-tests: yarn-project
	$(call test,$@,yarn-project/end-to-end)
	$(call test,$@,yarn-project)

yarn-project-benches: yarn-project
	$(call build,$@,yarn-project/end-to-end,build_bench)

#==============================================================================
# The Rest
#==============================================================================

# Release Image - Docker image for releases
release-image: yarn-project
	$(call build,$@,release-image)

release-image-tests: release-image
	$(call test,$@,release-image)

boxes: yarn-project
	$(call build,$@,boxes)

boxes-tests: boxes
	$(call test,$@,boxes)

playground: yarn-project
	$(call build,$@,playground)

playground-tests: playground
	$(call test,$@,playground)

docs: yarn-project
	$(call build,$@,docs)

docs-tests: docs
	$(call test,$@,docs)

aztec-up: yarn-project
	$(call build,$@,aztec-up)

aztec-up-tests: aztec-up
	$(call test,$@,aztec-up)

spartan:
	$(call build,$@,spartan)
