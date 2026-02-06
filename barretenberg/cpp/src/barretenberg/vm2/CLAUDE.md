# AVM development guide (C++)

**Scope:** Use this guide when working in `barretenberg/cpp/src/barretenberg/vm2` — the AVM C++ simulator, trace generation, and prover. For barretenberg-wide build and workflow, see `barretenberg/cpp/CLAUDE.md`. For PIL relation sources and codegen, see `barretenberg/cpp/pil/vm2/CLAUDE.md`.

## Related rules

- **barretenberg/cpp/CLAUDE.md** — Barretenberg root: build presets, bootstrap, other cpp targets, VKs, benchmarking.
- **barretenberg/cpp/pil/vm2/CLAUDE.md** — PIL relations in `barretenberg/cpp/pil/vm2`; regenerating C++ from `.pil` files.
- **yarn-project/CLAUDE.md** — TypeScript monorepo; running AVM-related TS tests (bb-prover, simulator).

---

## Overview

The **Aztec Virtual Machine (AVM)** executes public transactions and proves that execution was correct. This directory contains:

- **Simulation** — Runs a transaction. Two modes:
  - **Fast mode:** Minimal output; used by block building.
  - **Witness generation:** Produces execution events for tracegen and proving.
- **Trace generation (tracegen)** — Turns execution events into a trace (matrix of rows/columns) encoding execution and memory.
- **Constraining (proving)** — Uses Barretenberg to produce a ZK proof that the trace satisfies the AVM relations.

## Directory layout

```
barretenberg/cpp/src/barretenberg/vm2/
├── simulation/
│   ├── lib/                # Shared simulation; no events.
│   ├── standalone/         # Fast mode only; no events.
│   └── gadgets/            # Witness-generation; emits events.
├── tracegen/               # Trace generation from events.
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
└── proving_helper.*pp      # External proving API.
```

## Git workflow

**IMPORTANT:** For AVM work, use base branch `merge-train/avm`, not `master`.

- `git diff merge-train/avm...HEAD`
- `git log merge-train/avm..HEAD`

## Build and test

Configure once: `cmake --preset clang20-assert`. All commands below are from `barretenberg/cpp/`.

1. **`bb-avm`** — CLI to simulate and prove.
   - Build: `cmake --build --preset clang20-assert --target bb-avm` (slow, ~4 min). Prefer the linter for quick iteration.
   - Binary: `barretenberg/cpp/build/bin/bb-avm`.
2. **`vm2_tests`** — AVM unit tests.
   - Build: `cmake --build --preset clang20-assert --target vm2_tests`. Run from `barretenberg/cpp/build`: `./bin/vm2_tests --gtest_filter="*test_name*"`.
3. **`nodejs_module`** — Fast simulation only; builds quickly.
   - Build: `cmake --build --preset clang20-assert --target nodejs_module`. For TS: from `barretenberg/cpp/`, run `(cd ../../barretenberg/ts/; ./scripts/copy_native.sh)` then bootstrap `yarn-project` (see yarn-project/CLAUDE.md).

## AVM and TypeScript

Most end-to-end AVM behavior is tested from TypeScript. Ensure `yarn-project` is bootstrapped (see yarn-project/CLAUDE.md); rebuild only if the repo or TS files changed.

- **`bb-avm` (bulk test):** From `yarn-project/bb-prover`:
  `LOG_LEVEL=verbose yarn test src/avm_proving_tests/avm_bulk.test.ts`.
  The run prints a line like:
  `…/barretenberg/cpp/build/bin/bb-avm avm_prove --avm-inputs /tmp/…/avm_inputs.bin -o /tmp/bb-… -v`.
  For C++-only iteration you can re-run that `bb-avm` command directly.
- **Fast simulation:** From `yarn-project/simulator`: `yarn test src/public`.
