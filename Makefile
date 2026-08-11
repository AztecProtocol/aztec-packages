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

.PHONY: noir-projects release-image playground docs aztec-up spartan labs-aztec-toolchain

#==============================================================================
# BOOTSTRAP TARGETS
#==============================================================================

# Fast bootstrap.
# aztec-up and aztec-up-tests are temporarily absent: see the aztec-up target below.
fast: yarn-project yarn-project-tests \
		aztec-nr \
		noir-contracts \
		contract-snapshots-tests \
		spartan \
		playground playground-tests \
		docs docs-tests \
		release-image release-image-tests \
		claude-tests

# Full bootstrap.
full: fast yarn-project-benches

# Everything required to run the full benchmark suite (see bootstrap.sh bench_cmds), and nothing more.
# yarn-project-benches covers the e2e bench inputs and yarn-project's own benches;
# noir-contracts was previously built transitively via yarn-project.
# chonk-inputs and crs pre-download the pinned Chonk IVC inputs and the CRS: the proof
# benches run in no-network containers, so bb and bb.js must find both on disk rather
# than fetch on demand.
bench: yarn-project-benches noir-contracts chonk-inputs crs

chonk-inputs:
	$(call run_command,$@,$(ROOT)/labs-aztec-toolchain,./download_chonk_inputs.sh)

crs:
	$(call run_command,$@,$(ROOT)/ci3/aws,./download_crs.sh)

# Release.
release: fast

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

noir-contracts: noir-projects-labs-format-check labs-aztec-toolchain
	$(call build,$@,noir-projects/labs/noir-contracts)

aztec-nr: noir-projects-labs-format-check labs-aztec-toolchain
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

# Disabled until the repo split is complete: not built or tested here, and left out of `fast`.
aztec-up: yarn-project labs-aztec-toolchain
	$(call build,$@,aztec-up)

aztec-up-tests: aztec-up
	$(call test,$@,aztec-up)

spartan:
	$(call build,$@,spartan)
