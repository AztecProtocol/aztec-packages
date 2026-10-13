# AVM development guide (C++)

**Scope:** Use this guide when working in `barretenberg/cpp/src/barretenberg/vm2` — the AVM C++ simulator, trace generation, and prover.

## Related rules

- **barretenberg/cpp/CLAUDE.md** — Barretenberg root: the build recipe and presets, bootstrap, other cpp targets, VKs, benchmarking.
- **barretenberg/cpp/pil/vm2/CLAUDE.md** — PIL relations in `barretenberg/cpp/pil/vm2`; regenerating C++ from `.pil` files.

Further reading: `barretenberg/cpp/pil/vm2/docs/README.md` (AVM circuit architecture), `constraining/recursion/TWO_LAYER_AVM_RECURSIVE_VERIFIER.md` (recursive verifier).

---

## Overview

The **Aztec Virtual Machine (AVM)** executes public transactions and proves that execution was correct. This directory contains:

- **Simulation** — Runs a transaction. Two modes:
  - **Fast mode:** Minimal output; used by block building (through the `bb-avm-sim` binary).
  - **Witness generation:** Produces execution events for tracegen and proving.
- **Trace generation (tracegen)** — Turns execution events into a trace (matrix of rows/columns) encoding execution and memory.
- **Constraining (proving)** — Uses Barretenberg to produce a ZK proof that the trace satisfies the AVM relations.

## Directory layout

```
barretenberg/cpp/src/barretenberg/vm2/
├── simulation/
│   ├── lib/                # Shared simulation; no events.
│   ├── standalone/         # Fast mode only; no events.
│   ├── gadgets/            # Witness-generation; emits events.
│   ├── events/             # Event types emitted by the gadgets.
│   ├── interfaces/         # Interfaces shared by the simulation modes.
│   └── testing/            # Simulation mocks and fixtures.
├── tracegen/               # Trace generation from events.
│   └── lib/                # Shared tracegen helpers (interaction definitions).
├── constraining/           # Prover and verifier.
├── common/                 # Shared config and utilities.
├── dsl/                    # Noir interface to AVM recursive verifier.
├── generated/              # Generated from PIL in barretenberg/cpp/pil/vm2 (see barretenberg/cpp/pil/vm2/CLAUDE.md).
├── integration_tests/      # Simulation + tracegen + proving tests.
├── optimized/              # Hand-tuned relation implementations.
├── testing/                # Shared test fixtures and helpers.
├── tooling/                # AVM CLI debugger and stats.
├── simulation_helper.*pp   # External simulation API.
├── tracegen_helper.*pp     # External tracegen API.
├── proving_helper.*pp      # External proving API.
├── avm_api.*pp, api_avm.*pp  # API behind the bb-avm CLI commands.
└── avm_sim_api.*pp         # Fast-simulation API.

barretenberg/cpp/src/barretenberg/avm/   # bb-avm-sim: fast-simulation IPC server (main, CLI, IPC server).
```

## Git workflow

Base branch: see the table in root `CLAUDE.md` (`vm2/**` → `merge-train/avm`), e.g. `git diff origin/merge-train/avm...HEAD`.

## Build and test

The build recipe, presets and prerequisites are in `barretenberg/cpp/CLAUDE.md` "Build". For AVM work, configure `build/` with `cmake --preset clang20-assert`: asserts fire, and AVM column information gated on `!defined(NDEBUG)` is compiled in. It shares `build/` with `default` and `clang20`, so switching presets recompiles everything. All commands below are from `barretenberg/cpp/`.

1. **`bb-avm`** — CLI to simulate and prove.
   - Build: `cmake --build --preset clang20-assert --target bb-avm` (slow, ~4 min).
   - Binary: `barretenberg/cpp/build/bin/bb-avm`.
2. **`vm2_tests`** — AVM unit tests.
   - Build: `cmake --build --preset clang20-assert --target vm2_tests`. Run from `barretenberg/cpp/build`: `./bin/vm2_tests --gtest_filter="*test_name*"`.
3. **`bb-avm-sim`** — standalone fast simulator; the IPC server that the TypeScript node uses.
   - Build: `cmake --build --preset clang20-assert --target bb-avm-sim`. Package for TS: `barretenberg/ts/bootstrap.sh build_bb_avm_sim`.

Scripts (in `barretenberg/cpp/scripts/`): `avm2_gen.sh` (PIL codegen), `bump_avm_proof_length.sh` (after adding or removing columns), `avm_coverage.sh` (coverage over bb-prover test inputs).

## AVM and TypeScript

Most end-to-end AVM behavior is tested from TypeScript, in aztec-labs-eng/aztec-node `yarn-project/` (checked out here as `labs/yarn-project`; see its CLAUDE.md): bb-prover `src/avm_proving_tests` and simulator `src/public`. They consume `bb-avm` and `bb-avm-sim` built here.

For C++-only iteration on a proving input, run the bb-prover AVM tests with `BB_DEBUG_OUTPUT_DIR=<dir>`. Each proof then gets `<dir>/avm-prove-NNN/{avm_inputs.bin,command.sh}`, with the equivalent `bb-avm avm_prove --avm-inputs ...` command. Re-run it against a locally built `bb-avm`.
