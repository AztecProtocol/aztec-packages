# Aztec Packages Build System
# Phase 1: Project-level dependency management
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
build: serial-projects auxiliary

# Build all serial projects in dependency order
serial-projects: noir avm-transpiler barretenberg noir-projects l1-contracts yarn-project release-image

# Build all projects that can be built in parallel with the main build
auxiliary: boxes playground docs spartan aztec-up

#==============================================================================
# SERIAL PROJECT TARGETS
# These projects have dependencies on each other and must respect the order
# In Phase 1, we enforce serial execution of these targets to match current behavior
#==============================================================================

# Disable parallel execution for serial project targets
# This ensures noir → avm-transpiler → barretenberg → ... executes serially
# even when Make is invoked with -j flag
# Note: auxiliary targets can still run in parallel
.NOTPARALLEL: noir avm-transpiler barretenberg noir-projects l1-contracts yarn-project release-image

# Noir - The Noir language compiler and tools
noir:
	$(call build_project,noir,$(COLOR_noir))

# AVM Transpiler - Rust library for AVM bytecode transpilation
# Dependencies: noir
avm-transpiler: noir
	$(call build_project,avm-transpiler,$(COLOR_avm))

# Barretenberg - C++ cryptographic library and proving system
# Dependencies: avm-transpiler (needs libavm_transpiler.a for linking)
barretenberg: avm-transpiler
	$(call build_project,barretenberg,$(COLOR_barretenberg))

# Noir Projects - Protocol circuits, contracts, and Aztec.nr
# Dependencies: noir (nargo binary), barretenberg (for testing)
noir-projects: noir barretenberg
	$(call build_project,noir-projects,$(COLOR_noir_projects))

# L1 Contracts - Ethereum L1 smart contracts
# Dependencies: noir-projects (needs rollup_root_verifier.sol)
l1-contracts: noir noir-projects
	$(call build_project,l1-contracts,$(COLOR_l1))

# Yarn Project - TypeScript monorepo with all TS packages
# Dependencies: noir (types, JS bindings), barretenberg (bb binary, bb.js),
#               noir-projects (circuit types), l1-contracts (contract artifacts)
yarn-project: noir barretenberg noir-projects l1-contracts
	$(call build_project,yarn-project,$(COLOR_yarn))

# Release Image - Docker image for releases
# Dependencies: yarn-project (needs built artifacts)
release-image: yarn-project
	$(call build_project,release-image,$(COLOR_release))

#==============================================================================
# AUXILIARY PROJECT TARGETS
# These projects can be built in parallel with each other
# Each gets a unique color for easy identification in interleaved output
#==============================================================================

boxes: yarn-project
	$(call build_project,boxes,$(COLOR_boxes))

playground: yarn-project
	$(call build_project,playground,$(COLOR_playground))

docs: noir barretenberg yarn-project
	$(call build_project,docs,$(COLOR_docs))

spartan: yarn-project
	$(call build_project,spartan,$(COLOR_spartan))

aztec-up: yarn-project
	$(call build_project,aztec-up,$(COLOR_aztec_up))
