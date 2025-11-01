# Aztec Packages Build System
#
# This Makefile is called by the root bootstrap.sh build() function.
# It coordinates the build order and dependencies between projects.
# The actual build logic remains in each project's bootstrap.sh script.
#
# Usage (typically called from bootstrap.sh):
#   make              # Build everything
#   make -j8          # Build with 8 parallel jobs
#   make noir         # Build only noir
#   make barretenberg # Build barretenberg (and dependencies)
#   make bb-cpp       # Build only barretenberg C++ library
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

# ANSI 256-color palette - curated readable colors (avoiding black/white/gray)
# These are chosen for good contrast on both light and dark terminals
READABLE_COLORS := 33 39 76 82 99 165 166 172 196 202 208 214 220 226

# Function to compute color from project name hash
# Uses a simple hash to pick from READABLE_COLORS array
define compute_color
$(word $(shell echo "$$((($$(printf '%s' '$(1)' | cksum | cut -d' ' -f1) % $(words $(READABLE_COLORS))) + 1))"),$(READABLE_COLORS))
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
.PHONY: noir avm-transpiler barretenberg noir-projects l1-contracts yarn-project release-image
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
avm-transpiler: noir-sync
	$(call build,$@,avm-transpiler)

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

# BB CRS Download - Downloads cryptographic reference string
bb-crs:
	$(call build,$@,barretenberg/crs)

# BBup - BB updater tool
bb-bbup:
	$(call build,$@,barretenberg/bbup)

# BB C++ Native - Native bb binary and libraries
bb-cpp-native: avm-transpiler
	$(call build,$@,barretenberg/cpp,build_native)

# BB C++ WASM - Single-threaded WebAssembly build
bb-cpp-wasm:
	$(call build,$@,barretenberg/cpp,build_wasm)

# BB C++ WASM Threads - Multi-threaded WebAssembly build
bb-cpp-wasm-threads:
	$(call build,$@,barretenberg/cpp,build_wasm_threads)

# Cross-compile for ARM64 Linux (release only)
bb-cpp-cross-arm64-linux: avm-transpiler
	$(call build,$@,barretenberg/cpp,build_cross arm64-linux)

# Cross-compile for AMD64 macOS (release only)
bb-cpp-cross-amd64-macos: avm-transpiler
	$(call build,$@,barretenberg/cpp,build_cross amd64-macos)

# Cross-compile for ARM64 macOS (release or CI_FULL)
bb-cpp-cross-arm64-macos: avm-transpiler
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

# Noir Projects - Protocol circuits, contracts, and Aztec.nr
noir-projects: noir bb-cpp-native
	$(call build,$@,noir-projects)

# L1 Contracts - Ethereum L1 smart contracts
# Dependencies: noir-projects (needs rollup_root_verifier.sol)
# TODO: Split so we can "link in" the verifier later.
l1-contracts: noir-projects
	$(call build,$@,l1-contracts)

# Yarn Project - TypeScript monorepo with all TS packages
# Dependencies: noir (types, JS bindings), bb-cpp-wasm* (for bb.js), bb-ts (TypeScript bindings),
#               noir-projects (circuit types), l1-contracts (contract artifacts)
# Note: Only needs WASM builds and bb-ts, not native bb (which can build in parallel)
yarn-project: bb-cpp-wasm bb-cpp-wasm-threads bb-ts noir-projects l1-contracts
	$(call build,$@,yarn-project)

# Release Image - Docker image for releases
# Dependencies: yarn-project (needs built artifacts)
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
