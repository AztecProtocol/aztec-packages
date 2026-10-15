---
name: capture-app-flow
description: Pointer to the aztec-node skill that captures ivc-inputs.msgpack from an external Aztec app's transaction flow, and to the barretenberg skills that prove and benchmark the result. Use when investigating a client-side proving perf regression in an app that consumes published Aztec packages, or when adding a new app flow to the Chonk benchmark set.
argument-hint: <app-repo> <flow> e.g. "myapp checkout-lifecycle"
---

# Capture an external app's flow as Chonk IVC inputs

The capture uses aztec-node tooling (aztec.js `profile()`, `aztec-up`, `aztec start --local-network`). The skill lives in aztec-node: `.claude/skills/capture-app-flow/SKILL.md` in `aztec-labs-eng/aztec-node`. With the `labs` submodule checked out, read `labs/.claude/skills/capture-app-flow/SKILL.md`.

After capture, prove and benchmark the `ivc-inputs.msgpack` files in this repo:

- `barretenberg/.claude/skills/benchmark-chonk/SKILL.md`: proving, per-circuit breakdowns, WASM.
- `barretenberg/.claude/skills/remote-bench/SKILL.md`: single-run numbers on the remote benchmarking machine.
- `.claude/skills/chonk-inputs/SKILL.md`: the pinned-input machinery (`barretenberg/cpp/chonk-pinned-flows/`).
- `barretenberg/cpp/src/barretenberg/chonk/private_execution_steps.hpp`: the C++ decoder for the msgpack.
