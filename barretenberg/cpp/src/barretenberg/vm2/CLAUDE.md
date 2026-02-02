# AVM development guide

## Overview

The Aztec Virtual Machine (AVM) is the subsystem that executes public transactions and proves that execution was correct.

The current directory holds the C++ simulator, and the code to generate a ZK proof of execution. It is divided in 3 main parts
- **Simulation**: takes an input transaction and executes the code. Simulation can be done in either
    - **Fast mode**: tries to execute as fast as possible and generates minimal outputs. This flow is used by block building.
    - **For witness generation**: this mode generates execution events, that will later be used to build a trace and prove execution.
- **Trace generation** (tracegen): takes a series of execution events and creates a trace (a matrix of rows and columns) that encodes the execution of the program, memory evolution, etc.
- **Constraining**: uses the Barretenberg proving system to generate a ZK proof stating that the trace satisfies the AVM relations. Also known as proving.

## Directory Structure

```
barretenberg/cpp/vm2
├── simulation/
│   ├── lib/                # Supporting simulation code that does not generate events.
│   ├── standalone/         # Simulation code exclusive to fast mode. Does not generate events.
│   └── gadgets/            # Simulation code used for witness generation. Generates events. Some of it might be reused in fast mode.
├── tracegen/               # Code for trace generation.
├── constraining/           # Prover and verifier code.
├── common/                 # Utilities and configurations shared by all submodules.
├── dsl/                    # Noir interface to the AVM recursive verifier.
├── generated/              # Files generated from the PIL relation files in barretenberg/cpp/pil/vm2. See @barretenberg/cpp/pil/vm2/CLAUDE.md.
├── integration_tests/      # Tests that exercise simulation, tracegen and proving.
├── optimized/              # Hand-crafted versions of some of the relations.
├── testing/                # Testing fixtures and utilities shared by all submodules.
├── tooling/                # AVM cli debugger and stat collection.
│
├── simulation_helper.*pp   # Externally facing simulation API.
├── tracegen_helper.*pp     # Externally facing tracegen API.
└── proving_helper.*pp      # Externally facing proving API.
```

## Git workflow for the AVM

**IMPORTANT**: When comparing branches or looking at diffs for AVM work, use `merge-train/avm` as the base branch, NOT `master`. The master branch is often outdated for AVM development.

Examples:
- `git diff merge-train/avm...HEAD` (not `git diff master...HEAD`)
- `git log merge-train/avm..HEAD` (not `git log master..HEAD`)

## Main targets, executables and tests

We use cmake to build. These commands should be executed in the `barretenberg/cpp/` directory.
Configure cmake with `cmake --preset clang20-assert`. This is only needed once.

1. **The `bb-avm` binary**: this binary can be used as a standalone CLI to simulate and prove.
   It can be built with `cmake --build --preset clang20-assert --target bb-avm`.
   Note that this will take long to build, approximately 4 minutes, so it's not good for fast iteration.
   You may want to rely on the linter for fast iteration.
   The built binary will be located in `barretenberg/cpp/build/bin/bb-avm`.
2. **The `vm2_tests` binary**: all AVM unit tests are compiler into this binary.
   It can be built with `cmake --build --preset clang20-assert --target vm2_tests`.
   Note that this will take even longer than 4 minutes to build.
   Tests should be run in the `barretenberg/cpp/build` directory due to data dependencies.
   You can then run a specific test using `./bin/vm2_tests --gtest_filter="*test_name*"`.
3. **The `nodejs_module`**: fast simulation (without proving) is compiled and exported as a node module.
   It can be built with `cmake --build --preset clang20-assert --target nodejs_module`.
   This builds quickly. If working only on fast simulation, this is a good way to see if the code
   compiles. If you ever need to run fast simulation from Typescript then:
   - the nodejs module needs to be copied to the right location, by executing
     `(cd ../../barretenberg/ts/; ./scripts/copy_native.sh)` (still at `barretenberg/cpp/`).
   - the `yarn-project` needs to be bootstrapped.

## Interactions of the AVM with TypeScript code.

While `vm2_tests` provide good unit test coverage, most end to end AVM code is exercised and tested via TypeScript.

To run TS tests, the `yarn-project` (usually in `~/aztec-packages/yarn-project`) project has to be up to date.
You can find instructions in @`yarn-project/CLAUDE.md`. In short, run `bootstrap.sh` in that folder to build it.

NOTE: Building `yarn-project` is only necessary if
- It has never been done before
- You changed some typescript file

1. **The `bb-avm` binary**: a good test for this binary is what we call the "bulk test".
   Run `LOG_LEVEL=verbose yarn test src/avm_proving_tests/avm_bulk.test.ts` in the
   `yarn-project/bb-prover` directory. This test will simulate (for witgen), tracegen, and prove.
   It takes a while (around 30 seconds) but it's not too long.

   NOTE: This test generates "avm inputs" and calls the `bb-avm` binary. The output of that test should have a line that looks something like
   `/mnt/user-data/<user_name>/aztec-packages/barretenberg/cpp/build/bin/bb-avm avm_prove --avm-inputs /tmp/<dir>/avm_inputs.bin -o /tmp/bb-<something> -v`.
   After running the test for the first time, the AVM inputs will have been generated.
   If you need to iterate on C++-only changes, you can directly execute `bb-avm` via that command.
2. **Fast simulation**: to test fast simulation you can run `yarn test src/public` in the
    `yarn-project/simulator/` directory.
