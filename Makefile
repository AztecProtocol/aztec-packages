# Aztec Packages Build System
#
# This Makefile is called by the root bootstrap.sh build and build_and_test functions.
# It coordinates the build order and dependencies between projects.
# The actual build logic remains in each project's bootstrap.sh script.
#
# Note that "test" targets don't *run* tests, they just output test commands to /tmp/test_cmds.
#
# Expectation is to run with one of the following targets:
# - make [all]
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
# function-name: Optional bootstrap.sh command (defaults to $(BUILD_MODE))
define build
	$(call run_command,$(1),$(ROOT)/$(2),$(ROOT)/ci3/denoise './bootstrap.sh $(3)')
endef

# Collects the test commands from the given project
# Writes them line-by-line (important to prevent line splitting, lines must be < 4k) to /tmp/test_cmds.
# The test engine is expected to be running and it will read commands from this file.
define test
	$(call run_command,$(1),$(ROOT)/$(2),\
	  ./bootstrap.sh test_cmds $(3) | $(ROOT)/ci3/filter_test_cmds | tee -a /tmp/test_cmds >/dev/null)
endef

#==============================================================================
# PHONY TARGETS - Everything, we're just a dependency tree...
#==============================================================================

.PHONY: all $(MAKECMDGOALS)

#==============================================================================
# BOOTSTRAP TARGETS
#==============================================================================

# Fast bootstrap
all: release-image barretenberg boxes playground docs spartan aztec-up \
		 bb-tests l1-contracts-tests yarn-project-tests boxes-tests playground-tests aztec-up-tests docs-tests noir-protocol-circuits-tests

# Full bootstrap
full: release-image barretenberg boxes playground docs spartan aztec-up \
			bb-cpp-full yarn-project-benches \
		  bb-full-tests l1-contracts-tests yarn-project-tests boxes-tests playground-tests aztec-up-tests docs-tests noir-protocol-circuits-tests

# Release. Everything plus copy bb cross compiles to ts projects.
release: all bb-cpp-release-dir bb-ts-cross-copy yarn-project-cross-copy

#==============================================================================
# Noir
#==============================================================================

noir-sync:
	$(call build,$@,noir,noir-sync)

noir: noir-sync
	$(call build,$@,noir)

#==============================================================================
# AVM Transpiler
#==============================================================================

avm-transpiler-native: noir-sync
	$(call build,$@,avm-transpiler,build_native)

avm-transpiler-cross-amd64-macos: noir-sync
	$(call build,$@,avm-transpiler,build_cross amd64-macos)

avm-transpiler-cross-arm64-macos: noir-sync
	$(call build,$@,avm-transpiler,build_cross arm64-macos)

avm-transpiler-cross: avm-transpiler-cross-amd64-macos avm-transpiler-cross-arm64-macos

#==============================================================================
# Barretenberg
#==============================================================================

# Barretenberg - Aggregate target for all barretenberg sub-projects.
barretenberg: bb-cpp bb-ts bb-acir bb-docs bb-sol bb-bbup bb-crs

# BB C++ - Main aggregate target.
bb-cpp: bb-cpp-native bb-cpp-wasm bb-cpp-wasm-threads

# BB CRS Download
bb-crs:
	$(call build,$@,barretenberg/crs)

# BBup - BB updater tool
bb-bbup:
	$(call build,$@,barretenberg/bbup)

# BB C++ Native - Split into compilation and linking phases
# Compilation phase: Build barretenberg + vm2_sim objects (can run in parallel with avm-transpiler)
bb-cpp-native-objects:
	$(call build,$@,barretenberg/cpp,build_native_objects)

# Linking phase: Link all native binaries (needs avm-transpiler)
bb-cpp-native: bb-cpp-native-objects avm-transpiler-native
	$(call build,$@,barretenberg/cpp,build_native)

# BB C++ WASM - Single-threaded WebAssembly build
bb-cpp-wasm:
	$(call build,$@,barretenberg/cpp,build_wasm)

# BB C++ WASM Threads - Multi-threaded WebAssembly build
bb-cpp-wasm-threads:
	$(call build,$@,barretenberg/cpp,build_wasm_threads)

bb-cpp-wasm-threads-benches: bb-cpp-wasm-threads
	$(call build,$@,barretenberg/cpp,build_wasm_threads_benches)

# Cross-compile object phases (parallel with avm-transpiler cross-compile)
bb-cpp-cross-arm64-linux-objects:
	$(call build,$@,barretenberg/cpp,build_cross_objects arm64-linux)

bb-cpp-cross-amd64-macos-objects:
	$(call build,$@,barretenberg/cpp,build_cross_objects amd64-macos)

bb-cpp-cross-arm64-macos-objects:
	$(call build,$@,barretenberg/cpp,build_cross_objects arm64-macos)

# Cross-compile for ARM64 Linux (release only)
bb-cpp-cross-arm64-linux: bb-cpp-cross-arm64-linux-objects avm-transpiler-native
	$(call build,$@,barretenberg/cpp,build_cross arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: bb-cpp-cross-amd64-macos-objects avm-transpiler-cross-amd64-macos
	$(call build,$@,barretenberg/cpp,build_cross amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: bb-cpp-cross-arm64-macos-objects avm-transpiler-cross-arm64-macos
	$(call build,$@,barretenberg/cpp,build_cross arm64-macos)

bb-cpp-cross: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos

# GCC syntax check (CI only, non-release)
bb-cpp-gcc:
	$(call build,$@,barretenberg/cpp,build_gcc_syntax_check_only)

# Fuzzing preset check (CI only, non-release)
bb-cpp-fuzzing:
	$(call build,$@,barretenberg/cpp,build_fuzzing_syntax_check_only)

# Address sanitizer build (CI only, non-release)
bb-cpp-asan:
	$(call build,$@,barretenberg/cpp,build_asan_fast)

# SMT verification (CI_FULL only)
bb-cpp-smt:
	$(call build,$@,barretenberg/cpp,build_smt_verification)

bb-cpp-release-dir: bb-cpp-native bb-cpp-cross
	$(call build,$@,barretenberg/cpp,build_release_dir)

bb-cpp-full: bb-cpp-gcc bb-cpp-fuzzing bb-cpp-asan bb-cpp-smt bb-cpp-cross-arm64-macos bb-cpp-wasm-threads-benches

# BB TypeScript - TypeScript bindings
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-native
	$(call build,$@,barretenberg/ts)

# Copies the cross-compiles into bb.js.
bb-ts-cross-copy: bb-ts bb-cpp-cross
	$(call build,$@,barretenberg/ts,cross_copy)

# BB ACIR Tests - ACIR compatibility tests
bb-acir: noir bb-cpp-native bb-ts
	$(call build,$@,barretenberg/acir_tests)

# BB Documentation
bb-docs:
	$(call build,$@,barretenberg/docs)

# BB Solidity - Solidity verifier contracts
bb-sol: bb-cpp-native
	$(call build,$@,barretenberg/sol)

#==============================================================================
# Barretenberg Tests
#==============================================================================

# TODO: Each group of tests could be triggered as build completes, rather than need to wait for all.
bb-cpp-tests: bb-cpp-native
	$(call test,$@,barretenberg/cpp)

bb-cpp-full-tests: bb-cpp-native bb-cpp-smt bb-cpp-asan bb-cpp-smt
	$(call test,$@,barretenberg/cpp)

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

bb-tests: bb-cpp-tests bb-acir-tests bb-ts-tests bb-sol-tests bb-bbup-tests bb-docs-tests

bb-full-tests: bb-cpp-full-tests bb-acir-tests bb-ts-tests bb-sol-tests bb-bbup-tests bb-docs-tests

#==============================================================================
# Noir Projects
#==============================================================================

noir-protocol-circuits: noir bb-cpp-native
	$(call build,$@,noir-projects/noir-protocol-circuits)

noir-protocol-circuits-tests: noir noir-protocol-circuits
	$(call test,$@,noir-projects/noir-protocol-circuits)

mock-protocol-circuits: noir bb-cpp-native
	$(call build,$@,noir-projects/mock-protocol-circuits)

noir-contracts: noir bb-cpp-native
	$(call build,$@,noir-projects/noir-contracts)

aztec-nr: noir bb-cpp-native
	$(call build,$@,noir-projects/aztec-nr)

# These tests are not included in the dep tree.
# Rather this target must be explicitly called by bootstrap.sh after it's started the txe's.
noir-projects-txe-tests:
	$(call test,$@,noir-projects/aztec-nr)
	$(call test,$@,noir-projects/noir-contracts)
	$(call test,$@,noir-projects/noir-contracts-comp-failures)

# Noir Projects - Aggregate target (builds all sub-projects)
noir-projects: noir-protocol-circuits mock-protocol-circuits noir-contracts aztec-nr

#==============================================================================
# L1 Contracts - Ethereum L1 smart contracts
#==============================================================================

# l1-contracts-src: Build all src/ contracts (fully independent!)
l1-contracts-src:
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

# Copies the cross-compiles into yarn-project/native/build.
yarn-project-cross-copy: bb-cpp-cross
	$(call build,$@,yarn-project,cross_copy)

#==============================================================================
# The Rest
#==============================================================================

# Release Image - Docker image for releases
release-image: yarn-project
	$(call build,$@,release-image)

boxes: yarn-project
	$(call build,$@,boxes)

boxes-tests: boxes
	$(call test,$@,boxes)

playground: yarn-project
	$(call build,$@,playground)

playground-tests: playground
	$(call test,$@,playground)

# Docs - Project documentation
docs: yarn-project
	$(call build,$@,docs)

docs-tests: docs
	$(call test,$@,docs)

spartan: yarn-project
	$(call build,$@,spartan)

aztec-up: yarn-project
	$(call build,$@,aztec-up)

aztec-up-tests: aztec-up release-image
	$(call test,$@,aztec-up)
