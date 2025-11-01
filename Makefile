# Aztec Packages Build System
#
# This Makefile is called by the root bootstrap.sh build() function.
# It coordinates the build order and dependencies between projects.
# The actual build logic remains in each project's bootstrap.sh script.
#
# The BUILD_MODE variable is passed from bootstrap.sh (fast/full/etc)

# Shell to use for all commands
SHELL := /bin/bash

export DENOISE := 1

ROOT := $(shell git rev-parse --show-toplevel)
ARCH := $(shell $(ROOT)/ci3/arch 2>/dev/null || echo "unknown")
CI ?= 0
CI_FULL ?= 0
IS_RELEASE := $(shell $(ROOT)/ci3/semver check "$(REF_NAME)" && echo 1 || echo 0)
IS_AMD64 := $(shell [ "$(ARCH)" = "amd64" ] && echo 1 || echo 0)

# Function to compute color from project name hash
# Picks a color between 20 and 231 (avoiding very dark/light colors)
define compute_color
$(shell echo "$$((($$(printf '%s' '$(1)' | cksum | cut -d' ' -f1) % 212) + 20))")
endef

# Core helper to run a shell command with colored, prefixed output
# Usage: $(call run_command,label,directory,command)
# Color is automatically computed from label hash
define run_command
	@color=$(call compute_color,$(1)); \
	project=$(1); \
	set -o pipefail; \
	cd $(2) && stdbuf -oL -eL $(3) 2>&1 | \
	while IFS= read -r line; do \
		printf '\033[38;5;%sm[%s]\033[0m %s\n' "$$color" "$$project" "$$line"; \
	done; \
	exit $${PIPESTATUS[0]}
endef

# Main build helper - calls bootstrap.sh with optional function argument
# Usage: $(call build,label,project-path[,function-name])
# label: Display name for colored output (usually the target name)
# project-path: Path to the project directory
# function-name: Optional bootstrap.sh command (defaults to $(BUILD_MODE))
define build
	$(call run_command,$(1),$(ROOT)/$(2),$(ROOT)/ci3/denoise './bootstrap.sh $(if $(3),$(3),$(BUILD_MODE))')
endef

#==============================================================================
# PHONY TARGETS
#==============================================================================

.PHONY: all build
.PHONY: noir avm-transpiler avm-transpiler-native avm-transpiler-cross avm-transpiler-cross-amd64-macos avm-transpiler-cross-arm64-macos barretenberg noir-projects noir-protocol-circuits mock-protocol-circuits noir-contracts aztec-nr l1-contracts l1-contracts-src l1-contracts-verifier yarn-project release-image
.PHONY: bb-crs bb-bbup bb-cpp bb-ts bb-acir-tests bb-docs bb-sol
.PHONY: bb-cpp-native bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-cross bb-cpp-ci
.PHONY: bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos
.PHONY: bb-cpp-gcc bb-cpp-fuzzing bb-cpp-asan bb-cpp-smt
.PHONY: boxes playground docs spartan aztec-up

#==============================================================================
# DEFAULT TARGET
#==============================================================================

all: release-image barretenberg boxes playground docs spartan aztec-up

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

# Determine which cross-compilation targets to build for avm-transpiler
AVM_CROSS_TARGETS :=
ifeq ($(IS_RELEASE),1)
  ifeq ($(IS_AMD64),1)
    AVM_CROSS_TARGETS := avm-transpiler-cross-amd64-macos avm-transpiler-cross-arm64-macos
  endif
endif

# Native build (always needed)
avm-transpiler-native: noir-sync
	$(call build,$@,avm-transpiler,build_native)

# Cross-compile for AMD64 macOS (release only)
avm-transpiler-cross-amd64-macos: avm-transpiler-native
	$(call build,$@,avm-transpiler,build_cross amd64-macos)

# Cross-compile for ARM64 macOS (release only)
avm-transpiler-cross-arm64-macos: avm-transpiler-native
	$(call build,$@,avm-transpiler,build_cross arm64-macos)

# Aggregate cross-compile target
avm-transpiler-cross: $(AVM_CROSS_TARGETS)

# Default avm-transpiler target (just native, cross builds happen conditionally)
avm-transpiler: avm-transpiler-native $(AVM_CROSS_TARGETS)

#==============================================================================
# Barretenberg
#==============================================================================

# Determine which cross-compilation targets to build
BB_CPP_CROSS_TARGETS :=
ifeq ($(IS_RELEASE),1)
  ifeq ($(IS_AMD64),1)
    BB_CPP_CROSS_TARGETS := bb-cpp-cross-arm64-linux bb-cpp-cross-amd64-macos bb-cpp-cross-arm64-macos
  endif
else ifeq ($(CI_FULL),1)
  ifeq ($(IS_AMD64),1)
    BB_CPP_CROSS_TARGETS := bb-cpp-cross-arm64-macos
  endif
endif

# Determine which CI targets to build
BB_CPP_CI_TARGETS :=
ifeq ($(CI),1)
  ifeq ($(IS_AMD64),1)
    ifneq ($(IS_RELEASE),1)
      BB_CPP_CI_TARGETS := bb-cpp-gcc bb-cpp-fuzzing bb-cpp-asan
    endif
  endif
endif
ifeq ($(CI_FULL),1)
  ifeq ($(IS_AMD64),1)
    BB_CPP_CI_TARGETS += bb-cpp-smt
  endif
endif

# Barretenberg - Aggregate target for all barretenberg sub-projects.
barretenberg: bb-cpp bb-ts bb-acir-tests bb-docs bb-sol bb-bbup

# BB C++ - Main aggregate target.
bb-cpp: bb-cpp-native bb-cpp-wasm bb-cpp-wasm-threads bb-cpp-cross bb-cpp-ci

# BB CRS Download
bb-crs:
	$(call build,$@,barretenberg/crs)

# BBup - BB updater tool
bb-bbup:
	$(call build,$@,barretenberg/bbup)

# BB C++ Native - Native bb binary and libraries
bb-cpp-native: avm-transpiler-native
	$(call build,$@,barretenberg/cpp,build_native)

# BB C++ WASM - Single-threaded WebAssembly build
bb-cpp-wasm:
	$(call build,$@,barretenberg/cpp,build_wasm)

# BB C++ WASM Threads - Multi-threaded WebAssembly build
bb-cpp-wasm-threads:
	$(call build,$@,barretenberg/cpp,build_wasm_threads)

# Cross-compile for ARM64 Linux (release only)
bb-cpp-cross-arm64-linux: avm-transpiler-native
	$(call build,$@,barretenberg/cpp,build_cross arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: avm-transpiler-cross-amd64-macos
	$(call build,$@,barretenberg/cpp,build_cross amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: avm-transpiler-cross-arm64-macos
	$(call build,$@,barretenberg/cpp,build_cross arm64-macos)

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

# Conditional aggregate targets using parse-time dependency lists
bb-cpp-cross: $(BB_CPP_CROSS_TARGETS)

bb-cpp-ci: $(BB_CPP_CI_TARGETS)

# BB TypeScript - TypeScript bindings
# Dependencies: Only needs WASM builds (for bb.js), not native (will need native soon)
bb-ts: bb-cpp-wasm bb-cpp-wasm-threads
	$(call build,$@,barretenberg/ts)

# BB ACIR Tests - ACIR compatibility tests
bb-acir-tests: noir bb-cpp-native
	$(call build,$@,barretenberg/acir_tests)

# BB Documentation
bb-docs:
	$(call build,$@,barretenberg/docs)

# BB Solidity - Solidity verifier contracts
bb-sol: bb-cpp-native
	$(call build,$@,barretenberg/sol)

#==============================================================================
# Noir Projects
#==============================================================================

noir-protocol-circuits: noir bb-cpp-native
	$(call build,$@,noir-projects/noir-protocol-circuits)

mock-protocol-circuits: noir bb-cpp-native
	$(call build,$@,noir-projects/mock-protocol-circuits)

noir-contracts: noir bb-cpp-native
	$(call build,$@,noir-projects/noir-contracts)

aztec-nr: noir bb-cpp-native
	$(call build,$@,noir-projects/aztec-nr)

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

#==============================================================================
# Yarn Project - TypeScript monorepo with all TS packages
#==============================================================================

yarn-project: bb-cpp-wasm bb-cpp-wasm-threads bb-ts noir-projects l1-contracts
	$(call build,$@,yarn-project)

#==============================================================================
# The Rest
#==============================================================================

# Release Image - Docker image for releases
release-image: yarn-project
	$(call build,$@,release-image)

boxes: yarn-project
	$(call build,$@,boxes)

playground: yarn-project
	$(call build,$@,playground)

# Docs - Project documentation
docs: yarn-project
	$(call build,$@,docs)

spartan: yarn-project
	$(call build,$@,spartan)

aztec-up: yarn-project
	$(call build,$@,aztec-up)
