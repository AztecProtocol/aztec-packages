# Aztec Packages Build System
# Phase 2: Fine-grained dependency management
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

# Build mode: passed from bootstrap.sh, defaults to fast
BUILD_MODE ?= fast

# Git root directory
ROOT := $(shell git rev-parse --show-toplevel)

export DENOISE := 1

# ANSI color codes for project output (using printf in shell for proper escaping)
# We assign a color number to each project and let the shell script handle the escape codes
COLOR_noir := 33
COLOR_avm := 76
COLOR_barretenberg := 208
COLOR_bb_bbup := 202
COLOR_bb_cpp := 208
COLOR_bb_ts := 214
COLOR_bb_acir := 220
COLOR_bb_docs := 226
COLOR_bb_sol := 196
COLOR_bb_crs := 166
COLOR_noir_projects := 165
COLOR_l1 := 39
COLOR_yarn := 220
COLOR_release := 99
COLOR_boxes := 33
COLOR_playground := 76
COLOR_docs := 208
COLOR_spartan := 165
COLOR_aztec_up := 39

# Helper to run a project's bootstrap.sh with colored, prefixed output
# All projects get colored prefix for consistency and easier tracking
# Usage: $(call build_project,project-name,color-number)
define build_project
	@color=$(2); \
	project=$(1); \
	set -o pipefail; \
	cd $(ROOT)/$(1) && stdbuf -oL -eL $(ROOT)/ci3/denoise './bootstrap.sh $(BUILD_MODE)' 2>&1 | \
	while IFS= read -r line; do \
		printf '\033[38;5;%sm[%s]\033[0m %s\n' "$$color" "$$project" "$$line"; \
	done; \
	exit $${PIPESTATUS[0]}
endef

#==============================================================================
# PHONY TARGETS
#==============================================================================

.PHONY: all build
.PHONY: noir avm-transpiler barretenberg noir-projects l1-contracts yarn-project release-image
.PHONY: bb-crs bb-bbup bb-cpp bb-ts bb-acir-tests bb-docs bb-sol
.PHONY: boxes playground docs spartan aztec-up
.PHONY: auxiliary serial-projects

#==============================================================================
# DEFAULT TARGET
#==============================================================================

all: build

#==============================================================================
# MAIN BUILD TARGETS
#==============================================================================

# Top-level build - orchestrates the entire build process
# Prerequisites (submodules, toolchains, corepack) are handled by bootstrap.sh before calling make
# Note: We list both serial and auxiliary targets as direct dependencies so they can run in parallel
# The actual ordering is controlled by each target's dependencies, not by this list
build: release-image bb-crs bb-bbup bb-docs bb-sol bb-acir-tests boxes playground docs spartan aztec-up

# DEPRECATED: Kept for reference, but not used anymore
# serial-projects: noir avm-transpiler bb-cpp bb-ts noir-projects l1-contracts yarn-project release-image
# auxiliary: bb-crs bb-bbup bb-docs bb-sol bb-acir-tests boxes playground docs spartan aztec-up

#==============================================================================
# PROJECT TARGETS
# Dependencies control execution order - no need for .NOTPARALLEL
# Phase 2: Fine-grained parallelism where dependencies allow
#==============================================================================

# Note: We removed .NOTPARALLEL to allow true parallelism
# The dependency graph ensures correct ordering:
# - Critical path: noir → avm-transpiler → bb-cpp → bb-ts → noir-projects → l1-contracts → yarn-project → release-image
# - Parallel branches: bb-crs, bb-bbup can start immediately
#                      bb-docs, bb-sol, bb-acir-tests can start after bb-cpp
#                      boxes, playground, docs, spartan, aztec-up can start after yarn-project

# Noir - The Noir language compiler and tools
noir:
	$(call build_project,noir,$(COLOR_noir))

# AVM Transpiler - Rust library for AVM bytecode transpilation
# Dependencies: noir
avm-transpiler: noir
	$(call build_project,avm-transpiler,$(COLOR_avm))

#==============================================================================
# BARRETENBERG SUBPROJECTS
# Phase 2: Fine-grained targets for better parallelism
#==============================================================================

# Barretenberg - Aggregate target for all barretenberg subprojects
# For backward compatibility and convenience
barretenberg: bb-cpp bb-ts bb-acir-tests bb-docs bb-sol bb-bbup

# BB CRS Download - Downloads cryptographic reference string
# Can run independently in parallel (only needed for testing, not building)
bb-crs:
	$(call build_project,barretenberg/crs,$(COLOR_bb_crs))

# BBup - BB updater tool
# Can run independently in parallel
bb-bbup:
	$(call build_project,barretenberg/bbup,$(COLOR_bb_bbup))

# BB C++ - Main C++ library (bb binary, bb.js, tests, benchmarks)
# Dependencies: avm-transpiler (needs libavm_transpiler.a for native linking)
# Note: This already parallelizes internally via GNU parallel (native, wasm, wasm-threads, cross-builds)
bb-cpp: avm-transpiler
	$(call build_project,barretenberg/cpp,$(COLOR_bb_cpp))

# BB TypeScript - TypeScript bindings
# Dependencies: bb-cpp (needs bb.js wasm output)
bb-ts: bb-cpp
	$(call build_project,barretenberg/ts,$(COLOR_bb_ts))

# BB ACIR Tests - ACIR compatibility tests
# Dependencies: bb-cpp (needs bb binary)
bb-acir-tests: bb-cpp
	$(call build_project,barretenberg/acir_tests,$(COLOR_bb_acir))

# BB Documentation - Barretenberg documentation
# Dependencies: bb-cpp (documents the built artifacts)
# Can run in parallel with other downstream tasks
bb-docs: bb-cpp
	$(call build_project,barretenberg/docs,$(COLOR_bb_docs))

# BB Solidity - Solidity verifier contracts
# Dependencies: bb-cpp (may need verifier contracts)
# Can run in parallel with other downstream tasks
bb-sol: bb-cpp
	$(call build_project,barretenberg/sol,$(COLOR_bb_sol))

# Noir Projects - Protocol circuits, contracts, and Aztec.nr
# Dependencies: noir (nargo binary), bb-cpp (for testing with bb binary)
# Note: Only needs bb-cpp, not the full barretenberg (docs/sol can run in parallel)
noir-projects: noir bb-cpp
	$(call build_project,noir-projects,$(COLOR_noir_projects))

# L1 Contracts - Ethereum L1 smart contracts
# Dependencies: noir-projects (needs rollup_root_verifier.sol)
l1-contracts: noir noir-projects
	$(call build_project,l1-contracts,$(COLOR_l1))

# Yarn Project - TypeScript monorepo with all TS packages
# Dependencies: noir (types, JS bindings), bb-cpp (bb binary, bb.js), bb-ts (TypeScript bindings),
#               noir-projects (circuit types), l1-contracts (contract artifacts)
# Note: Only needs bb-cpp and bb-ts, not the full barretenberg (docs/sol/acir-tests can run in parallel)
yarn-project: noir bb-cpp bb-ts noir-projects l1-contracts
	$(call build_project,yarn-project,$(COLOR_yarn))

# Release Image - Docker image for releases
# Dependencies: yarn-project (needs built artifacts)
release-image: yarn-project
	$(call build_project,release-image,$(COLOR_release))

#==============================================================================
# AUXILIARY PROJECT TARGETS
# These projects can be built in parallel with each other and with bb-docs/bb-sol/bb-acir-tests
# Each gets a unique color for easy identification in interleaved output
#==============================================================================

boxes: yarn-project
	$(call build_project,boxes,$(COLOR_boxes))

playground: yarn-project
	$(call build_project,playground,$(COLOR_playground))

# Docs - Project documentation
# Dependencies: Only needs core build artifacts (noir, bb-cpp, yarn-project)
# Can run in parallel with bb-docs, bb-sol, bb-acir-tests
docs: noir bb-cpp yarn-project
	$(call build_project,docs,$(COLOR_docs))

spartan: yarn-project
	$(call build_project,spartan,$(COLOR_spartan))

aztec-up: yarn-project
	$(call build_project,aztec-up,$(COLOR_aztec_up))
