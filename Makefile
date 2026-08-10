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

.PHONY: barretenberg noir-projects release-image playground docs aztec-up spartan wsdb bb-avm-sim labs-aztec-toolchain

#==============================================================================
# BOOTSTRAP TARGETS
#==============================================================================

# Fast bootstrap.
# wsdb belongs to foundation until disentangled.
fast-foundation: barretenberg bb-tests \
		wsdb \
		ipc-runtime ipc-codegen-tests \
		claude-tests

# aztec-up and aztec-up-tests are temporarily absent: see the aztec-up target below.
fast-labs: yarn-project yarn-project-tests \
		aztec-nr \
		noir-contracts \
		contract-snapshots-tests \
		spartan \
		playground playground-tests \
		docs docs-tests \
		release-image release-image-tests \
		claude-tests

fast: fast-foundation fast-labs

# Full bootstrap.
full-foundation: fast-foundation bb-full-tests bb-cpp-full

full-labs: fast-labs yarn-project-benches

full: full-foundation full-labs

# Everything required to run the full benchmark suite (see bootstrap.sh bench_cmds),
# and nothing more. bb-crs pre-downloads the CRS: the proof benches run in no-network
# containers, so bb.js must find it locally rather than fetch on demand.
bench-foundation: bb-cpp-native bb-cpp-wasm-threads bb-ts bb-crs

# yarn-project-benches covers the e2e bench inputs and yarn-project's own benches;
# noir-contracts was previously built transitively via yarn-project.
bench-labs: yarn-project-benches noir-contracts

bench: bench-foundation bench-labs

# Release. Everything plus copy bb cross compiles to ts projects.
release-foundation: fast-foundation bb-cpp-release-dir bb-ts-cross-copy bb-avm-sim-cross-copy ipc-runtime-cross

release-labs: fast-labs

release: release-foundation release-labs

#==============================================================================
# Barretenberg
#==============================================================================

# Barretenberg - Aggregate target for all barretenberg sub-projects.
barretenberg: bb-cpp bb-ts bb-avm-sim bb-cdb bb-rs bb-docs bb-bbup bb-crs

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
# Compilation phase: Build barretenberg + vm2_sim objects
bb-cpp-native-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_native_objects)

# Linking phase: Link all native binaries
bb-cpp-native: bb-cpp-native-objects bb-cpp-yarn bb-cpp-format-check
	$(call build,$@,barretenberg/cpp,build_native)

bb-cpp-chonk-inputs:
	$(call build,$@,barretenberg/cpp,download_chonk_inputs)

# BB C++ WASM - Single-threaded WebAssembly build
bb-cpp-wasm:
	$(call build,$@,barretenberg/cpp,build_preset wasm)

# BB C++ WASM Threads - Multi-threaded WebAssembly build
bb-cpp-wasm-threads:
	$(call build,$@,barretenberg/cpp,build_preset wasm-threads)

# Cross-compile object phases
bb-cpp-cross-arm64-linux-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_cross_objects arm64-linux)

bb-cpp-cross-amd64-macos-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_cross_objects amd64-macos)

bb-cpp-cross-arm64-macos-objects: bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_cross_objects arm64-macos)

# Cross-compile for ARM64 Linux (release only)
bb-cpp-cross-arm64-linux: bb-cpp-native bb-cpp-cross-arm64-linux-objects bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos-objects bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos-objects bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset arm64-macos)

# Cross-compile for AMD64 Windows (release only)
bb-cpp-cross-amd64-windows: bb-cpp-cross-arm64-macos
	$(call build,$@,barretenberg/cpp,build_preset amd64-windows)

# iOS SDK download (shared by all iOS cross-compile targets)
bb-cpp-ios-sdk:
	$(call run_command,$@,$(ROOT)/barretenberg/cpp,bash scripts/download-ios-sdk.sh)

# Android sysroot download (shared by all Android cross-compile targets)
bb-cpp-android-sysroot:
	$(call run_command,$@,$(ROOT)/barretenberg/cpp,bash scripts/download-android-sysroot.sh)

# Cross-compile for ARM64 iOS (release only, static lib only)
bb-cpp-cross-arm64-ios: bb-cpp-cross-amd64-windows bb-cpp-ios-sdk
	$(call build,$@,barretenberg/cpp,build_preset arm64-ios)

# Cross-compile for ARM64 iOS Simulator (release only, static lib only)
bb-cpp-cross-arm64-ios-sim: bb-cpp-cross-arm64-ios bb-cpp-ios-sdk
	$(call build,$@,barretenberg/cpp,build_preset arm64-ios-sim)

# Cross-compile for ARM64 Android (release only, static lib only)
bb-cpp-cross-arm64-android: bb-cpp-cross-arm64-ios-sim bb-cpp-android-sysroot
	$(call build,$@,barretenberg/cpp,build_preset arm64-android)

# Cross-compile for x86_64 Android (release only, static lib only)
bb-cpp-cross-x86_64-android: bb-cpp-cross-arm64-android bb-cpp-android-sysroot
	$(call build,$@,barretenberg/cpp,build_preset x86_64-android)

bb-cpp-cross: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos bb-cpp-cross-amd64-windows bb-cpp-cross-arm64-ios bb-cpp-cross-arm64-ios-sim bb-cpp-cross-arm64-android bb-cpp-cross-x86_64-android

# GCC syntax check (CI only, non-release)
bb-cpp-gcc:
	$(call build,$@,barretenberg/cpp,build_gcc_syntax_check_only)

# Fuzzing preset check (CI only, non-release)
bb-cpp-fuzzing:
	$(call build,$@,barretenberg/cpp,build_fuzzing_syntax_check_only)

# Windows cross-compile syntax check (CI only, non-release) - the Windows binary is otherwise
# only built on the release path, so this gates Windows-only breakages at PR time.
bb-cpp-windows:
	$(call build,$@,barretenberg/cpp,build_windows_syntax_check_only)

# Address sanitizer build (CI only, non-release)
bb-cpp-asan:
	$(call build,$@,barretenberg/cpp,build_preset asan-fast)

# SMT verification (CI_FULL only)
bb-cpp-smt:
	$(call build,$@,barretenberg/cpp,build_smt_verification)

bb-cpp-release-dir: bb-cpp-native bb-cpp-cross bb-cpp-wasm bb-cpp-wasm-threads
	$(call build,$@,barretenberg/cpp,build_release_dir)

bb-cpp-full: bb-cpp bb-cpp-gcc bb-cpp-fuzzing bb-cpp-windows bb-cpp-asan bb-cpp-smt bb-cpp-cross-arm64-macos bb-cpp-cross-arm64-ios bb-cpp-cross-arm64-android

# BB TypeScript - TypeScript bindings
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-native ipc-runtime
	$(call build,$@,barretenberg/ts,build_bb_js)

# Copies the cross-compiles into bb.js.
bb-ts-cross-copy: bb-ts bb-cpp-cross
	$(call build,$@,barretenberg/ts,cross_copy_bb_js)

bb-avm-sim: ipc-codegen ipc-runtime bb-cpp-native
	$(call build,$@,barretenberg/ts,build_bb_avm_sim)

bb-avm-sim-cross-copy: bb-avm-sim bb-cpp-cross
	$(call build,$@,barretenberg/ts,cross_copy_bb_avm_sim)

# Generated @aztec/cdb server bindings. Ordered after bb-avm-sim rather than run
# alongside it: both regenerate the same barretenberg/ts workspaces and install
# into the same node_modules.
bb-cdb: ipc-codegen ipc-runtime bb-avm-sim
	$(call build,$@,barretenberg/ts,build_cdb)

# BB Rust - barretenberg-rs FFI crate
bb-rs: bb-ts bb-cpp-native
	$(call build,$@,barretenberg/rust)

# BB Documentation
bb-docs:
	$(call build,$@,barretenberg/docs)

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

bb-ts-tests: bb-ts
	$(call test,$@,barretenberg/ts)

bb-docs-tests: bb-docs
	$(call test,$@,barretenberg/docs)

bb-bbup-tests: bb-bbup
	$(call test,$@,barretenberg/bbup)

bb-rs-tests: bb-rs
	$(call test,$@,barretenberg/rust)

bb-tests: bb-cpp-native-tests bb-ts-tests bb-bbup-tests bb-docs-tests bb-rs-tests

bb-full-tests: bb-cpp-wasm-threads-tests bb-cpp-asan-tests bb-cpp-smt-tests

#==============================================================================
# IPC Codegen
#==============================================================================

.PHONY: ipc-codegen ipc-codegen-tests
ipc-codegen: ipc-runtime
	$(call build,$@,ipc-codegen)

ipc-codegen-tests: ipc-codegen
	$(call test,$@,ipc-codegen)

.PHONY: ipc-runtime ipc-runtime-tests ipc-runtime-cross
ipc-runtime:
	$(call build,$@,ipc-runtime)

ipc-runtime-tests: ipc-runtime
	$(call test,$@,ipc-runtime)

# Cross-compile the NAPI addon for the 3 non-host release targets.
# Host (amd64-linux) addon is produced by the standalone `ipc-runtime` target.
ipc-runtime-cross-arm64-linux:
	$(call build,$@,ipc-runtime,build_cross arm64-linux)

ipc-runtime-cross-amd64-macos:
	$(call build,$@,ipc-runtime,build_cross amd64-macos)

ipc-runtime-cross-arm64-macos:
	$(call build,$@,ipc-runtime,build_cross arm64-macos)

ipc-runtime-cross: ipc-runtime ipc-runtime-cross-arm64-linux ipc-runtime-cross-amd64-macos ipc-runtime-cross-arm64-macos

#==============================================================================
# WSDB
#==============================================================================

wsdb: ipc-codegen ipc-runtime bb-cpp-native
	$(call build,$@,wsdb)

#==============================================================================
# .claude tooling
#==============================================================================

.PHONY: claude-tests
claude-tests:
	$(call test,$@,.claude)

#==============================================================================
# Labs Aztec Toolchain
#==============================================================================

labs-aztec-toolchain:
	$(call build,$@,labs-aztec-toolchain)

#==============================================================================
# Noir Projects
#==============================================================================

# Format check. It also warms the nargo dependency cache, so it must complete before the
# subproject builds to avoid parallel nargo runs tripping over each other downloading.
noir-projects-labs-format-check: labs-aztec-toolchain
	$(call build,$@,noir-projects/labs,format_check)

noir-contracts: bb-cpp-native noir-projects-labs-format-check labs-aztec-toolchain
	$(call build,$@,noir-projects/labs/noir-contracts)

aztec-nr: bb-cpp-native noir-projects-labs-format-check labs-aztec-toolchain
	$(call build,$@,noir-projects/labs/aztec-nr)

# These tests are not included in the dep tree.
# Rather this target must be explicitly called by bootstrap.sh after it's started the txe's.
noir-projects-txe-tests:
	$(call test,$@,noir-projects/labs/aztec-nr)
	$(call test,$@,noir-projects/labs/noir-contracts)

contract-snapshots-tests: noir-projects-labs-format-check labs-aztec-toolchain
	$(call test,$@,noir-projects/labs/contract-snapshots)

# Noir Projects - Aggregate target
noir-projects-labs: noir-contracts aztec-nr

noir-projects: noir-projects-labs

#==============================================================================
# Yarn Project - TypeScript monorepo with all TS packages
#==============================================================================

yarn-project: noir-projects-labs labs-aztec-toolchain
	$(call build,$@,yarn-project)

# If we still in the monorepo, we need to additionally depend on everything else explicitly.
# In the labs repo, we will consume them differently.
# TODO(fcarreiro): comment this out when pinning binaries.
yarn-project: bb-ts wsdb bb-avm-sim bb-cdb

yarn-project-tests: yarn-project
	$(call test,$@,yarn-project/end-to-end)
	$(call test,$@,yarn-project)

yarn-project-benches: yarn-project
	$(call build,$@,yarn-project/end-to-end,build_bench)

#==============================================================================
# The Rest
#==============================================================================

# Release Image - Docker image for releases
release-image: yarn-project labs-aztec-toolchain
	$(call build,$@,release-image)

release-image-tests: release-image
	$(call test,$@,release-image)

playground: yarn-project
	$(call build,$@,playground)

playground-tests: playground
	$(call test,$@,playground)

docs: yarn-project labs-aztec-toolchain
	$(call build,$@,docs)

docs-tests: docs
	$(call test,$@,docs)

# Disabled until the repo split is complete: not built or tested here, and left out of `fast-labs`.
aztec-up: yarn-project labs-aztec-toolchain
	$(call build,$@,aztec-up)

aztec-up-tests: aztec-up
	$(call test,$@,aztec-up)

spartan:
	$(call build,$@,spartan)
