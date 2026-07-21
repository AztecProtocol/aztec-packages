# flavor-codegen

TS generator for Barretenberg's hand-modeled flavor and execution-trace headers.
Emits two families of files:

- `barretenberg/cpp/src/barretenberg/flavor/generated/<family>_flavor_generated.hpp`
  — `EntityId`, `NUM_*_ENTITIES`, per-relation capability bools, `AllEntities` storage +
  named accessors, group views, commitment labels, `REPEATED_COMMITMENTS`, the
  `Relations_<FF>` tuple, and the builder-side bridge helpers (`get_gate_blocks`,
  `get_block_non_gate_selectors`, `GATE_KINDS`).
- `barretenberg/cpp/src/barretenberg/honk/execution_trace/generated/<family>_execution_trace_generated.hpp`
  — a `<Family>TraceBlock` alias + a `<Family>TraceBlockData` struct whose members
  are `[traceExtraBlocks..., relation-discovered blocks...]`; each relation-discovered
  block is constructed with the `GateKind` list it owns.

Out of scope: AVM (generated separately by `bb-pilcom`).

## Source of truth

`src/relations/*.ts` — one module per relation, declaring `cppName`, `header`,
`entities` (`kind: "precomputed" | "witness"`), `shiftedEntities`, `subsets`,
and optional `gateBlockName`.

`src/flavors/*.ts` — ordered list of relations + optional composite subsets +
`traceExtraBlocks` (e.g. `pub_inputs`, `ecc_op`) + `emitsTrace` flag.
Parameterized relations (databus) are factory-built per bus.

Each relation has a stable string `id` (used by capability-bool emission and
the bus-relation discriminator).

Algebraic data (subrelation lengths, degrees, accumulation) is not mirrored —
it lives only in the C++ relation headers. The TS layer knows entity layout,
subsets, and C++ identity.

## Layout derivation

Kind-bucketed (`masking → precomputed → witness`) per-relation walk: for each
kind, iterate relations in declared order, emit declared subsets first (subset
order), then leftover entities. Names dedupe — first mention wins position.
Shifted block appends `<name>_shift` in the same order.

Subsets are stored in insertion order, so `databus_selectors[bus_idx]` matches
the per-bus declaration order in `flavors/mega.ts`.

To change layout, reorder at the relation/subset declaration level.

## Trace-block alignment

Each relation with a `gateBlockName` contributes its `GateKind`s to that
block; `traceExtraBlocks` appears first. The hand-written
`mega_execution_trace.hpp` / `ultra_execution_trace.hpp` are thin wrappers
around generated `<Family>TraceBlockData`.

`get_gate_blocks(blocks)` on the flavor returns those blocks in declaration
order; `trace_to_polynomials.cpp` zips them with the parallel `GATE_KINDS`
array via `gate_selector_for(kind)`.

## Regenerate

```
cd barretenberg/cpp/scripts/flavor-codegen
npm run regenerate         # uses prebuilt dist/
npm run regenerate:dev     # tsc && node dist/main.js
```

Each emitted header is clang-formatted in place (`src/format.ts`) so a fresh
regen matches the committed (clang-formatted) version byte-for-byte.

Generated files are committed; the C++ build does not invoke Node. CI runs
`git diff --exit-code` against the generator output.

## Known follow-ups

### Consolidate `PrecomputedEntities` / `WitnessEntities` with `AllEntities`

The codegen emits standalone `PrecomputedEntities<DataType>` and
`WitnessEntities<DataType>` transport classes (~300 LOC each in the mega
header). Structurally they're the precomputed / witness subspan of
`AllEntities` — same names, same order, same types — duplicated because:

- `VerificationKey` inherits from `PrecomputedEntities<Commitment>` and
  needs standalone storage that survives independent of any prover
  instance (serialization, recursion).
- `WitnessCommitments` (= `WitnessEntities<Commitment>`) is constructed
  ahead of the full `AllEntities<Commitment>` during proving.

Possible refactors (deferred):

1. **Slim transport classes**: drop named accessors, expose only
   `operator[](LocalEntityId)`, `get_all()`, `==`, labels. ~80 LOC saved
   per flavor; ~20 caller sites migrate (`vk->q_m()` →
   `(*vk)[EntityId::q_m]`, mostly in `dsl/acir_proofs/honk_optimized_common.hpp`
   for the Solidity verifier template builder).
2. **`MaskedAllEntities<Commitment>` for VK storage**: a wrapper that
   stores only the precomputed slice but presents the `AllEntities`
   `operator[](EntityId)` API. Eliminates `PrecomputedEntities` entirely
   from the codegen path (~900 LOC). Requires `NativeVerificationKey_` /
   `FixedVKAndHash_` rework — both currently `public PrecomputedCommitments`.
   Non-codegen flavors (ECCVM, Translator, AVM, `sumcheck_test_flavor`)
   keep their hand-written precomputed classes; the VK template must
   stay flavor-parameterized so they're not forced to migrate.
3. **Full `AllEntities<Commitment>` VK storage**: simplest API, but
   default member-wise serialization would write all `NUM_ALL_ENTITIES`
   slots — wire-format breakage for persisted VKs and recursion. Needs
   custom serialization to emit only `get_precomputed()`.

Cross-flavor reuse constraint: any change must keep
`NativeVerificationKey_` / `FixedVKAndHash_` usable by hand-written
flavors (ECCVM, Translator, AVM) that won't migrate to codegen.
