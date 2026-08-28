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

.PHONY: noir barretenberg noir-projects l1-contracts wsdb bb-avm-sim

#==============================================================================
# BOOTSTRAP TARGETS
#==============================================================================

# Fast bootstrap.
# wsdb belongs to foundation until disentangled.
fast-foundation: barretenberg bb-tests \
		wsdb \
		l1-contracts l1-contracts-tests \
		mock-protocol-circuits \
		noir-protocol-circuits noir-protocol-circuits-tests \
		noir-protocol-circuits-variants \
		protocol-contracts protocol-contracts-tests \
		fnd-release-tests \
		ipc-runtime ipc-codegen-tests \
		constants-codegen constants-codegen-tests \
		labs-patches-tests \
		claude-tests

# The labs components are built from the aztec-node checkout in the labs/ submodule, against
# this tree's packages and binaries (see the Labs section).
fast-labs: labs-fast

fast: fast-foundation fast-labs

# Full bootstrap.
full-foundation: fast-foundation bb-full-tests bb-cpp-full

full-labs: labs-full

full: full-foundation full-labs

# Everything required to run the full benchmark suite (see bootstrap.sh bench_cmds),
# and nothing more. bb-sol adds the Solidity gas benchmark's generated verifier;
# bb-acir builds barretenberg/acir_tests, whose headless-test harness (ts-node)
# the bb browser memory bench (ci_benchmark_browser_memory.sh) drives.
bench-foundation: bb-cpp-native bb-cpp-wasm-threads bb-ts bb-sol bb-acir \
		noir-protocol-circuits l1-contracts

bench-labs: labs-bench

bench: bench-foundation bench-labs

# Release. Everything plus copy bb cross compiles to ts projects.
release-foundation: fast-foundation bb-cpp-release-dir bb-ts-cross-copy bb-avm-sim-cross-copy bb-bin-cross-copy ipc-runtime-cross

release-labs: fast-labs

release: release-foundation

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
barretenberg: bb-cpp bb-ts bb-avm-sim bb-cdb bb-bin bb-rs bb-acir bb-docs bb-sol bb-bbup bb-crs

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
bb-cpp-cross-arm64-linux: bb-cpp-native bb-cpp-cross-arm64-linux-objects avm-transpiler-cross-arm64-linux bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos-objects avm-transpiler-cross-amd64-macos bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos-objects avm-transpiler-cross-arm64-macos bb-cpp-yarn
	$(call build,$@,barretenberg/cpp,build_preset arm64-macos)

# Cross-compile for AMD64 Windows (release only)
bb-cpp-cross-amd64-windows: bb-cpp-cross-arm64-macos avm-transpiler-cross-amd64-windows
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

# BB TypeScript - TypeScript bindings. Ordered after bb-cdb (itself after bb-avm-sim): all three
# regenerate the same barretenberg/ts workspaces and `yarn install` into the same node_modules, so
# running them in parallel races whenever the node_modules cache misses.
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-native ipc-runtime bb-cdb
	$(call build,$@,barretenberg/ts,build_bb_js)

# Copies the cross-compiles into bb.js.
bb-ts-cross-copy: bb-ts bb-cpp-cross
	$(call build,$@,barretenberg/ts,cross_copy_bb_js)

bb-avm-sim: ipc-codegen ipc-runtime bb-cpp-native
	$(call build,$@,barretenberg/ts,build_bb_avm_sim)

# Ordered after bb-cdb for the same reason bb-cdb is ordered after bb-avm-sim:
# all three regenerate the same barretenberg/ts workspaces and install into the
# same node_modules.
bb-avm-sim-cross-copy: bb-avm-sim bb-cdb bb-cpp-cross
	$(call build,$@,barretenberg/ts,cross_copy_bb_avm_sim)

# Generated @aztec-foundation/cdb server bindings. Ordered after bb-avm-sim rather than run
# alongside it: both regenerate the same barretenberg/ts workspaces and install
# into the same node_modules.
bb-cdb: ipc-codegen ipc-runtime bb-avm-sim
	$(call build,$@,barretenberg/ts,build_cdb)

# bb and bb-avm as npm packages (meta + one package per platform).
bb-bin: bb-cpp-native
	$(call build,$@,barretenberg/ts,build_bb_bin)

# Stages every platform and checks each binary against the release tarballs.
bb-bin-cross-copy: bb-bin bb-cpp-cross bb-cpp-release-dir
	$(call build,$@,barretenberg/ts,cross_copy_bb_bin)

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
# Protocol Constants Codegen
#==============================================================================

.PHONY: constants-codegen constants-codegen-tests
constants-codegen:
	$(call build,$@,protocol/constants-codegen)

constants-codegen-tests: constants-codegen
	$(call test,$@,protocol/constants-codegen)

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
# Labs (aztec-node, checked out as the labs/ submodule)
#==============================================================================

# aztec-node pins released foundation packages and binaries. use-local rewrites its
# manifests to portal into this checkout and records the root in .fnd-root, so its
# components build against what this tree just built (see labs/labs-aztec-toolchain/pins.mjs).
# The rewrite is committed in the submodule as a marker commit that the patch series
# tooling ignores, so the labs tree is clean for ci3's cache hashing and yarn's immutable
# installs in CI.
LABS_DIR := $(ROOT)/labs

# What the labs manifests portal into (barretenberg/ts/*, wsdb/ts, ipc-runtime/ts,
# l1-contracts/l1-artifacts, protocol/constants-codegen, noir/packages/*) plus the
# binaries labs-aztec-toolchain symlinks (bb, bb-avm, nargo).
# The artifacts packages' installable content is a dist/ assembled from the built circuits.
# The release flow stages it before publishing; the labs use-local portals point at the same
# dists, so they must be staged before the submodule's yarn install resolves them.
fnd-artifacts-stage: noir-projects-fnd
	$(call build,$@,noir-projects/fnd,stage_packages)

labs-deps: bb-ts l1-contracts wsdb bb-avm-sim bb-cdb constants-codegen noir-projects-fnd fnd-artifacts-stage

# Checks the submodule out at its gitlink with the labs-patches series applied (no-op when
# already there). use-local rewrites are re-done after it, so it must run first.
labs-patched:
	$(call run_command,$@,$(ROOT),./labs-patches/bootstrap.sh apply)

# The tooling's sandbox lifecycle test, plus check of the committed series against the gitlink.
# After labs-patched: check must not race apply on the same submodule.
labs-patches-tests: labs-patched
	$(call test,$@,labs-patches)

# The portal resolutions change the lockfiles; they are refreshed here so the submodule's
# own installs see them consistent (yarn refuses to touch a lockfile under CI).
# scripts/labs_fnd_hashes.sh records the providers' content hashes in the submodule, which is
# what makes the labs cache keys (builds and tests) follow this tree.
labs-use-local: labs-patched labs-deps
	$(call run_command,$@,$(LABS_DIR),./labs-aztec-toolchain/bootstrap.sh use-local $(ROOT) \
	  && $(ROOT)/scripts/labs_fnd_hashes.sh \
	  && (cd yarn-project && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install --mode=update-lockfile) \
	  && (cd docs && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install --mode=update-lockfile) \
	  && $(ROOT)/labs-patches/bootstrap.sh commit-use-local)

# ci3 takes the repo root from an inherited $$root, so the submodule's make must not see
# this tree's. The test commands it collects are relative to the submodule, and the test
# engine runs them from this root: TEST_CMD_PREFIX (a labs patch) cds into the submodule
# and clears the inherited root so its ci3 re-derives it there.
# aztec-up, release-image, and the docker-compose based tests (the compose, web3signer and
# ha e2e flavours, the playground browser tests, the docs examples run) package or mount
# the labs tree on its own (verdaccio publish, docker build context, a compose volume of
# the checkout) where the use-local portals do not resolve, so they are left to the labs
# repo's own CI: the targets are not run and the test commands are skipped.
# scripts/labs_env.sh is the single definition of that environment, shared with the
# bootstrap-side collectors (scripts/labs_test_cmds.sh).
LABS_MAKE := $(ROOT)/scripts/labs_env.sh $(MAKE)

# fast covers what a foundation change can break: labs compiled against the portals and its
# unit/e2e tests, and the contracts against this tree's nargo/bb. docs, spartan, playground and
# the claude tooling only consume yarn-project and go in full (the pin-bump PR runs full).
labs-fast: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) \
	  yarn-project yarn-project-tests aztec-nr noir-contracts contract-snapshots-tests)

labs-full: labs-fast
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) \
	  spartan playground playground-tests docs docs-tests claude-tests yarn-project-benches)

# Just the labs yarn-project, for callers that need its build output and nothing else.
labs-yarn-project: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) yarn-project)

labs-bench: labs-use-local
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) bench)

.PHONY: labs-deps labs-patched labs-patches-tests labs-use-local labs-fast labs-full labs-bench labs-yarn-project fnd-artifacts-stage

#==============================================================================
# Noir Projects
#==============================================================================

# Generates the noir-protocol-circuits workspace files (Nargo.toml, autogenerated crates),
# which are git-ignored and must exist before nargo can run in that workspace. Needs only
# yarn/node, so no prerequisites: it runs in parallel with the noir build.
noir-protocol-circuits-variants:
	$(call build,$@,noir-projects/fnd/noir-protocol-circuits,generate_variants)

# Format check. It also warms the nargo dependency cache, so it must complete before the
# subproject builds to avoid parallel nargo runs tripping over each other downloading.
noir-projects-fnd-format-check: noir noir-protocol-circuits-variants
	$(call build,$@,noir-projects/fnd,format_check)

noir-protocol-circuits: noir bb-cpp-native noir-projects-fnd-format-check
	$(call build,$@,noir-projects/fnd/noir-protocol-circuits)

noir-protocol-circuits-tests: noir noir-protocol-circuits
	$(call test,$@,noir-projects/fnd/noir-protocol-circuits)

mock-protocol-circuits: noir bb-cpp-native noir-projects-fnd-format-check
	$(call build,$@,noir-projects/fnd/mock-protocol-circuits)

protocol-contracts: noir bb-cpp-native noir-projects-fnd-format-check
	$(call build,$@,noir-projects/fnd/noir-contracts)

protocol-contracts-tests: noir protocol-contracts
	$(call test,$@,noir-projects/fnd/noir-contracts)

# Everything the npm release path stages. Exists as its own target because filter_test_cmds derives
# MAKEFILE_TARGET by stripping the -tests suffix, so the stem has to name something buildable for
# grind_test to do a targeted rebuild.
fnd-release: noir-protocol-circuits mock-protocol-circuits protocol-contracts

# Smoke-tests the release path (staging plus a dry-run publish) against real build output, so a break
# surfaces on a PR rather than the first time it runs, on a release tag.
fnd-release-tests: fnd-release
	$(call test,$@,noir-projects/fnd,release)

# These tests are not included in the dep tree.
# Rather this target must be explicitly called by bootstrap.sh after it's started the txe's.
# Only labs code needs the TXE, so the target collects the submodule's own txe tests.
noir-projects-txe-tests:
	$(call run_command,$@,$(LABS_DIR),$(LABS_MAKE) noir-projects-txe-tests)

# Noir Projects - Aggregate target
noir-projects-fnd: noir-protocol-circuits mock-protocol-circuits protocol-contracts

noir-projects: noir-projects-fnd

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

# l1-contracts-artifacts: Generate the @aztec-foundation/l1-artifacts TS package (ABIs/bytecode/storage) and the
# self-contained foundry bundle used by the runtime forge deploy path. Must depend on the verifier, not
# just build_src: the generated artifact list includes HonkVerifier, and its real implementation is only
# produced by build_verifier (which compiles generated/HonkVerifier.sol, copied from noir-projects).
# build_src only compiles the src/ coverage mock of the same name, which collides on the same out/ path
# and would be published instead if the verifier had not run last.
l1-contracts-artifacts: l1-contracts-verifier
	$(call build,$@,l1-contracts,build_artifacts)

# l1-contracts: Complete build (aggregate target)
l1-contracts: l1-contracts-src l1-contracts-verifier l1-contracts-artifacts

l1-contracts-tests: l1-contracts-verifier
	$(call test,$@,l1-contracts)

