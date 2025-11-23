Continuous Integration System: CI3

This document details the CI version 3 system, providing its historical context, underlying rationale, and a comprehensive guide for its usage.

If any part of this documentation is unclear or incomplete, please raise it directly with Charlie so that the information can be reviewed and updated.

Historical Context

The project has utilized two prior CI systems, each with distinct philosophies:

CI1 (Bash & CLI Focused)

CI1 was a pure collection of bash scripts heavily relying on command-line tools.

Philosophy: Vendor agnostic and stateless on the build runners.

Workflow: Docker-centric, requiring every single project to maintain its own dedicated Dockerfile.

CI2 (Earthly Focused)

CI2 attempted to consolidate the CI workflow using Earthly.

Philosophy: Maintained the Docker-centric workflow but introduced a "merged" bash/Dockerfile syntax.

Drawback: Necessitated stateful build instances, contradicting the goal of stateless simplicity.

CI3: Philosophy and Architecture

CI3 reverts to the philosophical core of CI1—simplicity and agnosticism—but crucially removes the burdensome Docker-centric workflow that required per-project Dockerfiles, improving build speed and reducing maintenance overhead.

CI3 Key Features

Feature

Description

Rationale/Benefit

Vendor Agnostic

Minimal GitHub Actions (GA) configuration; maximum functionality directly accessible from the command line.

Ensures portability and prevents vendor lock-in.

Environment Consistency

Executes the exact same commands a developer runs within the official development container environment.

Implicitly tests and validates the integrity of our development container and bootstrap scripts.

Stateless Caching

Replaced CI1's container push/pull caching with artifact upload/download to an S3 bucket.

More robust, often faster, and cheaper caching for intermediate build artifacts.

Focused Docker Use

Docker is only used for building the development environment, running the bootstrap script inside the CI environment, and isolating network-intensive tests.

Reduces overhead and complexity, focusing on core container utility.

Consistent Interface

All project processes are exposed via a unified ./bootstrap.sh command interface (e.g., clean, fast, full, test, test_cmds).

Standardizes developer workflow across all repository projects.

Parallelization

Tests are unified via test_cmds and can be run in parallel across the entire repository for maximum system throughput.

Maximizes efficiency on multi-core machines.

Test Grinder

Tests are "ground" across N instances in the master merge queue. (TBD)

Significantly reduces the risk of flaky tests entering the master branch.

Shared Redis Cache

Uses a shared Redis cache to prevent successful tests from running twice in CI (except during grinding).

Dramatically improves CI run times on repeated builds.

Log Denoising

By default, only logs for failed commands are displayed. All logs are stored in a shared Redis cache, allowing developers to "drill-down" via unique log IDs.

Reduces terminal clutter and improves focus on errors.

The CI3 Scripts: Locality of Behaviour

CI3 is designed to be clutter-free. Here are the core scripts:

Script Path

Purpose

Key Concept

/ci.sh

Main interface for all CI workflow commands (triggering remote runs, tailing logs, historical lookups).

External CI/Remote Management.

/bootstrap.sh

Root script to build, test, and deploy the entire repository.

Repository-wide automation.

/**/bootstrap.sh

Project-specific entry point. Must contain everything needed to bootstrap, test, and release that project.

Locality of Behaviour.

/**/scripts/run_test.sh

Executes a single test case based on arguments provided by test_cmds.

Single Test Runner.

Philosophy Note: Avoid creating numerous small helper scripts. If a workflow problem exists, the existing bootstrap scripts should be updated to better support it.

Getting Started

For convenience, add the following aliases to your shell configuration (~/.zshrc):

alias ci='$(git rev-parse --show-toplevel)/ci.sh'
alias dl='$(git rev-parse --show-toplevel)/ci.sh dlog'


Initial Repository Setup

After cloning, run the following to prepare the environment quickly:

./bootstrap.sh
# Equivalent to: ./bootstrap.sh fast


The fast bootstrap uses the S3 cache to get the repository into a runnable state as quickly as possible.

To build everything from scratch without using the cache:

./bootstrap.sh full


Cleaning

Use this command to erase untracked files and submodules. Use with caution.

./bootstrap.sh clean


Running Tests

To run the entire repository test suite (not recommended for local machines):

./bootstrap.sh test


To run tests for specific projects:

./bootstrap.sh test yarn-project boxes


Tests across all specified projects run in parallel, limited to half the number of available vCPUs (typically physical cores).

Viewing Test Commands

To see the precise commands executed for testing:

./bootstrap.sh test_cmds


This output is filtered by patterns defined in the .test_skip_patterns file. The output format is:

<test_hash> <command_to_run_from_root>


Example output:

699e81f5e2f9e8a3 barretenberg/cpp/scripts/run_test.sh boomerang_value_detection_tests boomerang_ultra_circuit_constructor.test_graph_for_arithmetic_gates


Skipping Flaky Tests

Flaky tests are managed centrally in the repository root file: .test_skip_patterns.

Lines in this file are treated as regular expressions (grep patterns) used to filter the test_cmds. This allows for clear tracking and management of temporarily disabled tests.

# Example patterns in .test_skip_patterns
# noir
noir_lsp-.* notifications::notification_tests::test_caches_open_files
# noir-contracts
counter_contract Counter::extended_incrementing_and_decrementing


Flaky Test Resolution (Grinding)

When resolving a flaky test, you need to reproduce the failure.

Single-Threaded Grind

Runs the test repeatedly until failure:

while yarn-project/end-to-end/scripts/run_test.sh simple e2e_p2p/gossip_network; do true; done


Parallel Grind

Runs the test multiple times concurrently. This example runs it 10 times and stops on the first failure (--halt now,fail=1).

seq 1 10 | parallel --bar --halt now,fail=1 "yarn-project/end-to-end/scripts/run_test.sh simple e2e_p2p/gossip_network >/dev/null"


CI Workflow Management

Disabling Automatic Runs

If you have an open PR and do not want CI to constantly re-run on every push:

ci draft


To enable runs again:

ci ready


Manually Triggering CI Runs

Command

Target Environment

Cache Status

Description

ci local

Local containerized environment.

Test & Build Cache Enabled

Clones your latest commit locally and runs CI inside a container.

ci ec2

Fresh 128 vCPU EC2 instance.

Test & Build Cache Enabled

Simulates the exact GA workflow on remote hardware.

ci ec2-test

Fresh 128 vCPU EC2 instance.

Build Cache Enabled

Disables the test cache but keeps the build cache.

ci ec2-no-cache

Fresh 128 vCPU EC2 instance.

Caches Disabled

Full run, no build or test caching applied.

ci trigger

Existing PR in GitHub Actions.

Cache Enabled

Starts an asynchronous GA run for your PR.

Tailing Remote Logs

To track the progress of an asynchronous run triggered via ci trigger:

ci rlog


You can also provide a GA run ID to view historical logs.

CI Labels and Automation

The following labels control CI behavior on Pull Requests:

Label

Effect

Automation

ci-squash-and-merge

Automatically squashes all commits into a single commit upon merge.

Label removed after successful squash.

ci-no-squash

Exempts the PR from the single-commit requirement (e.g., for merge-train branches).

N/A

ci-merge-queue

Simulates merge queue behavior, running the full test suite.

N/A

ci-full

Forces a full CI run (equivalent to running ./bootstrap.sh full during CI).

N/A

ci-no-cache

Disables build caching for this specific CI run.

N/A

ci-no-fail-fast

Continues running all tests even after initial failures.

N/A

Content-Based CI Caching

CI3 incorporates an additional layer of caching based on repository content. When a CI run succeeds, a success marker is stored, keyed by the hash of the repository's file tree (git rev-parse HEAD^{tree}).

If the exact same file tree content is detected on a subsequent commit (e.g., after squashing commits or a rebase without changes), CI execution is skipped entirely.

Log Denoising and Inspection

When the Redis cache is available, the CI output is "denoised," showing only a status and a unique log ID for successful operations.

Example Denoised Log Output:

--- pull submodules ---
Executing: git submodule update --init --recursive
   0 ........................................... done (7s) (http://ci.aztec-labs.com/e6b8532f0c020b44)


Viewing Historical Logs

You can retrieve the full log content for any given ID (e.g., e6b8532f0c020b44) using the dlog command:

ci dlog e6b8532f0c020b44
# Or using the alias:
dl e6b8532f0c020b44


This opens the log in your configured $PAGER (usually less). If the job failed, the full log is also dumped directly to the terminal where the CI run took place.

Understanding the Cache Mechanism

The caching system is critical for CI performance.

Build and Test Hashes

All projects use at least a "build hash" and often a "test hash":

Build Hash: Computed via cache_content_hash. This hash includes all files that constitute the final built artifact (e.g., source files, dependency lists). If any of these files change, the artifact is rebuilt and re-cached in S3.

Test Hash: An additional hash input used solely for deciding if a test should be re-run. It includes files that affect testing but may not be part of the final build artifact (e.g., test utility scripts, test data).

The cache key for a test execution is a hash of the Test Hash and the Test Command. If a test runs successfully in CI, its redis key is recorded, preventing re-execution until the hash or command changes.

Cache Expiration: All cache entries automatically expire after 7 days.

Forcing a Cache Overwrite

If the build cache is corrupted and needs to be forcefully updated:

S3_FORCE_UPLOAD=1 ./bootstrap.sh full


This executes a full, scratch build and overwrites the existing S3 cache entry with the newly generated artifact hash.

Build Image / Devcontainer

Our unified development environment is defined in ./build-images/Dockerfile. This single file defines three distinct images:

build: Minimal image, used for running isolated tests. Lacks developer tools.

devbox: The official "devcontainer." Includes all developer tools on top of the build image.

sysbox: A variant of devbox tailored for internal use on the mainframe with Nesty's Sysbox runtime.

Q&A

I need to run yarn clean in a sub-project. How is that done now?

./bootstrap.sh clean yarn-project/<project_dir>


Run this command from the repository root, providing the project directory as an argument.

Where did the formatting and lint package.json scripts go?

Project-level linting and formatting are inefficient. We now use a project-wide optimized approach:

yarn-project/bootstrap.sh format


How can I manually trigger the master CI flow?

This flow is typically heavy and best executed on remote resources:

CI_FULL=1 ci ec2-test


This runs the full master-branch test suite on a fresh EC2 instance.

What are the key differences between SWC and TSC?

Strictness: SWC is stricter with ESM import hoisting. Circular dependencies must be resolved (tools like madge can help spot them).

Type Checking: SWC is significantly faster than TSC but does not perform type checking. A successful SWC build does not guarantee correct types.

To check types, run TYPECHECK=1 ./bootstrap.sh or maintain a watch process: yarn tsc -b -w --emitDeclarationOnly.

Build Compatibility: Building with tsc -b can cause subsequent test suites (especially those using Jest/SWC) to fail with a parse error. If this happens, re-build with SWC before testing: ./bootstrap.sh compile on yarn-project.

Contributing

Please adhere to the principle of "Locality of Behaviour." Involve Charlie in any proposed changes to the core CI scripts (ci3 folder, ci.sh, bootstrap.sh). The goal is to keep these scripts lean, clean, consistent, and fast.
