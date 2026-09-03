# Recursion Constraints Architecture Skeleton

## Purpose

This file is the master architecture skeleton for the recursion-constraint validation system.
It is not the implementation plan for one specific recursion family.

Its job is to define:

1. the common architecture shared by all recursion families;
2. the contracts that each family-specific implementation must follow;
3. the order in which discovery, fingerprint definition, validation, and mechanism work should happen;
4. the structure of future sub-plans for `HONK`, `AVM`, `HN`, and any other recursion family.

This file should stay at the architecture level.
Detailed family-specific plans should be created separately after this skeleton is stable.

## Current Role Of This File

This file is the source of truth for:

- system decomposition;
- shared abstractions;
- anchor-gate selection rules;
- artifact definitions;
- implementation phases;
- parallel-agent work split;
- the required shape of family-specific sub-plans.

This file should not become a dump of one family's stages or one experiment's notes.

## Design Principles

1. Reuse shared logic from `recursion_constraints_helper.hpp` whenever possible.
2. Keep family-specific knowledge in separate namespaces and files.
3. Separate discovery logic from runtime validation logic.
4. Use anchor-gates only when their uniqueness is justified structurally.
5. Treat generated analysis files as inputs for architecture and descriptor creation, not as the mechanism itself.
6. Build the generic mechanism only after the family-specific anchors and fingerprints are understood.

## System Layers

### 1. Shared Helper Layer

Main file:

- `barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp`

Responsibility:

- generic block hashing;
- fingerprint matching;
- linked-gate traversal;
- transcript squeeze extraction;
- challenge-generation validation;
- reusable Oink / Sumcheck / Shplemini / KZG utilities;
- common result structs used by validators.

Rule:

This layer should contain reusable primitives, not family-specific fingerprints.

### 2. Family Descriptor Layer

One file per recursion family.

Examples:

- `honk_recursion_validation.hpp`
- `avm_recursion_validation.hpp`
- `hn_recursion_validation.hpp`

Responsibility:

- define the namespace for one family;
- store `FunctionFingerprint` constants discovered from tests;
- define the family-specific stage list;
- define anchor descriptions for that family;
- provide validator functions for that family using shared helpers.

Rule:

This layer may call shared helpers, but must not duplicate their generic logic.

### 3. Mechanism Layer

Responsibility:

- orchestrate stage discovery and validation using family descriptors;
- expose a consistent entry point for running the mechanism on a built circuit;
- convert low-level validator results into a higher-level stage map.

Rule:

This layer should depend on the family descriptor layer and the shared helper layer.
It should not hardcode family-specific selectors directly.

### 4. Test And Discovery Layer

Responsibility:

- generate analysis artifacts;
- justify anchor-gate uniqueness;
- verify that individual mechanism parts find the correct stage ranges;
- protect against regressions in fingerprints and anchor assumptions.

Rule:

Tests come before final mechanism generalization.

## Required Architecture Objects

The architecture should be based on explicit objects or equivalent concepts, even if the final C++ names differ.

### FunctionFingerprint

Already present in shared helpers.

Required meaning:

- gate count;
- short fingerprint;
- full hash;
- scanner size or equivalent matching metadata.

### AnchorDescriptor

Each stage that needs anchoring should define:

- anchor name;
- anchor category;
- expected block type;
- structural uniqueness rule;
- helper function used to locate it;
- whether it is a primary anchor or fallback anchor.

Suggested categories:

- `challenge_gate`
- `commitment_receive_gate`
- `transcript_receive_gate`
- `vk_hash_gate`
- `padding_gate`
- `sumcheck_round_gate`
- `custom_structural_anchor`

### StageDescriptor

Each family-specific stage should define:

- stage name;
- stage category;
- whether it is expected to emit fingerprinted gates;
- which fingerprints belong to it;
- which anchor(s) are used to find it;
- which validator function verifies it;
- whether it is part of the core artifact or only a post-finalization extension.

Suggested stage categories:

- `acir_wrapper`
- `oink`
- `preprocessor`
- `sumcheck`
- `shplemini`
- `kzg`
- `post_verifier`
- `post_finalize`
- `transcript_only`

### FamilyArchitectureSpec

Each recursion family should have one top-level spec containing:

- family name;
- supported builders;
- supported proof types;
- stage descriptors;
- anchor descriptors;
- analysis artifact names;
- references to the best discovery tests;
- references to the shared helper functions the family is expected to reuse.

## Anchor-Gate Rules

Anchor-gates must not be chosen only because they look distinctive by inspection.

A gate is considered a valid anchor only if its uniqueness is justified by at least one of the following:

1. unique selector pattern within the relevant block;
2. unique selector pattern plus unique witness-link structure;
3. unique selector pattern plus stable transcript position;
4. unique selector pattern plus stable neighboring-stage relationship.

The preferred strategy is:

1. use a single unique anchor-gate when available;
2. otherwise use a structural anchor defined by anchor gate + linked block range;
3. otherwise use a compound anchor defined by two nearby anchors;
4. only then fall back to family-specific custom logic.

Each anchor used in the final mechanism must have a discovery test that justifies why it is stable enough.

### Pattern-Rarity Anchor Discovery

Before hardcoding family-specific anchors, add a discovery test that ranks gate patterns by rarity.

The test should:

1. build the target recursion circuit;
2. execute static analysis over the builder;
3. group gates by structural pattern;
4. rank patterns by frequency;
5. inspect the lowest-frequency patterns first;
6. collect witness indices used by gates in those rare patterns;
7. compare those witness indices with known important circuit variables.

Important variables include:

- transcript-derived challenges;
- public-input components;
- pairing-point components;
- IPA claims;
- verifier accumulator values;
- family-specific protocol outputs such as databus or ECC-op table commitments.

The output of this test is not a final validator.
It is a candidate-anchor report.

A rare pattern becomes a serious anchor candidate only when:

1. the pattern is structurally rare;
2. it is linked to a meaningful protocol variable;
3. the same relationship is stable across nearby baseline variants.

Examples of nearby variants:

- different public-input sizes;
- baseline versus ZK variant;
- baseline versus rollup/root-rollup variant;
- single-recursion versus multi-recursion test shape;
- kernel type variants for HN.

Do not promote a rare gate to a final `AnchorDescriptor` only because its selector pattern is unique in one test.
First prove that it is not a setup artifact, `fix_witness` artifact, weak equality constraint, or incidental compiler output.

## Artifact Types

### 1. Analysis Artifacts

Generated by baseline discovery tests.

Example naming:

- `honk_functions_analysis.txt`
- `avm_functions_analysis.txt`
- `hn_functions_analysis.txt`

Purpose:

- enumerate stages;
- capture gate ranges;
- produce candidate fingerprints;
- support manual or semi-manual creation of family descriptors.

### 2. Family Descriptor Data

Stored in family-specific namespace files.

Purpose:

- define the stable fingerprints and stage metadata used by runtime validation.

### 3. Mechanism Results

Produced by the future mechanism.

Purpose:

- report which stages were found;
- report where they were found;
- report which validators succeeded or failed.

### 4. Worktree Delivery Artifacts

Produced by parallel agents working in separate git worktrees.

Purpose:

- capture the full set of code changes made by one agent;
- make the result transferable without directly merging the entire worktree;
- provide a single handoff artifact that can be reviewed or applied elsewhere.

Required format:

- one `.patch` file per agent task;
- the patch must contain all changes made in that worktree for the assigned task;
- the patch is the default delivery artifact for agent-produced code changes.

## Family-Specific File Strategy

Each recursion family should have its own file containing:

1. a namespace dedicated to that family;
2. `FunctionFingerprint` constants for that family;
3. family-specific anchor descriptors;
4. family-specific stage descriptors;
5. validator functions that compose shared helpers;
6. optional family-only helpers that cannot reasonably live in `recursion_constraints_helper.hpp`.

Rule:

If logic is generic enough to be reused by at least two families, move it to the shared helper layer.
If it only expresses one family's structure, keep it in the family namespace.

## Discovery Workflow

The architecture requires this order of work:

### Phase 1. Baseline Analysis Test

For each family:

1. build the recursive circuit;
2. run static analysis over the builder;
3. emit `*_functions_analysis.txt`;
4. produce a first stage map.

Goal:

understand the structure before encoding it.

### Phase 2. Anchor Discovery

For each important stage:

1. identify candidate anchor-gates;
2. test whether their selector pattern is unique;
3. test whether the uniqueness is preserved by wiring/link structure;
4. record the accepted anchor strategy in the family descriptor design.

Goal:

justify the anchors instead of guessing them.

### Phase 3. Fingerprint Definition

For each stage:

1. define `FunctionFingerprint` values;
2. associate them with the stage descriptor;
3. record whether the stage is core or extension-only.

Goal:

turn discovery output into stable descriptor data.

### Phase 4. Partial Mechanism Construction

Implement the mechanism one family part at a time.

For each part:

1. implement locator logic;
2. implement validator logic;
3. add a test that proves this part alone finds the right region.

Goal:

avoid building the whole mechanism before any individual component is trusted.

### Phase 5. Integration

After enough family parts are stable:

1. connect them through the common mechanism layer;
2. verify stage ordering and boundary behavior;
3. verify post-finalization extensions separately from the core verifier pipeline.

## Test Taxonomy

The architecture should use different test kinds for different goals.

### Discovery Tests

Purpose:

- generate `*_functions_analysis.txt`;
- expose possible anchors;
- support manual reasoning.

### Anchor Uniqueness Tests

Purpose:

- prove that a chosen anchor is structurally unique enough;
- prevent accidental false anchors.

### Fingerprint Stability Tests

Purpose:

- validate that a stage's fingerprint still matches the expected range;
- catch changes in selector layout.

### Mechanism Unit Tests

Purpose:

- verify that one specific locator or validator works correctly.

### Mechanism Integration Tests

Purpose:

- verify that the combined stage-finding mechanism reconstructs the expected stage map for one family.

## Core Versus Extension Boundary

The architecture should explicitly separate:

### Core Verifier Pipeline

This is the part that usually belongs in the first family artifact:

- ACIR wrapper stages;
- Oink stages;
- preprocessor stages;
- Sumcheck stages;
- Shplemini stages;
- KZG stages;
- immediate output aggregation performed directly by the verifier path.

### Post-Finalization Extensions

These should be modeled separately when needed:

- IPA accumulation;
- full IPA recursive verification;
- root-rollup-specific finalize behavior;
- any family-specific post-processing that does not belong to the core gate-generating pipeline.

This separation is required so that baseline family artifacts stay comparable across recursion families.

## Parallel-Agent Master Split

This file exists partly to support parallel agents.

The recommended top-level split is:

### Agent A: Shared Helper Audit

Responsibilities:

- classify what already exists in `recursion_constraints_helper.hpp`;
- identify which helpers are reusable as-is;
- identify missing generic abstractions.

### Agent B: Anchor Discovery Strategy

Responsibilities:

- define the selection criteria for anchor-gates;
- propose candidate anchor classes;
- design uniqueness tests.

### Agent C: Family Descriptor Shape

Responsibilities:

- define the common shape of `AnchorDescriptor`, `StageDescriptor`, and `FamilyArchitectureSpec`;
- ensure the shape works for all recursion families.

### Agent D: Family-Specific Research

Responsibilities:

- investigate one recursion family at a time;
- produce the sub-plan for that family using the master skeleton.

### Agent E: Mechanism Assembly Strategy

Responsibilities:

- define how validated family descriptors plug into one common mechanism;
- keep this work blocked until the descriptor shape and anchor rules are stable.

## Parallel-Agent Result Delivery

Parallel agents are expected to work in separate git worktrees.

Because of that, each agent must return its implementation result in a transportable artifact format.

### Required Delivery Rule

After completing its assigned task, each agent must produce:

1. the code changes inside its own worktree;
2. one `.patch` file that contains the full diff for that task.

The `.patch` file is the required handoff artifact between the agent worktree and the main integration flow.

### Why This Rule Exists

This keeps agent outputs:

- isolated from each other during implementation;
- easy to review independently;
- easy to apply, compare, or discard;
- compatible with a workflow where integration happens after several parallel tasks complete.

### Expected Agent Output

Each agent should return:

1. a short summary of what was done;
2. the path to the generated `.patch` file;
3. any notes about assumptions, limitations, or follow-up work.

### Sub-Plan Requirement

Every future family-specific sub-plan should specify:

- whether the task is expected to be executed in a separate worktree;
- what the resulting `.patch` file should contain;
- whether the patch is discovery-only, descriptor-only, validator-only, or mechanism-level work.

## Required Output Of Future Sub-Plans

Each family-specific sub-plan should be derived from this skeleton and must answer:

1. What is the family's baseline configuration?
2. Which stages belong to the baseline artifact?
3. Which stages are extension-only?
4. Which anchors are primary?
5. Which anchors are fallback?
6. Which helpers from `recursion_constraints_helper.hpp` are reused?
7. Which new family-specific validators are required?
8. Which tests generate the analysis artifact?
9. Which tests justify anchor uniqueness?
10. Which tests verify each implemented mechanism part?
11. What `.patch` artifact should the agent return from its worktree?

## Definition Of Done For The Master Architecture

This architecture skeleton is ready when:

1. the system layers are fixed;
2. the descriptor concepts are fixed;
3. the anchor selection rules are fixed;
4. the artifact taxonomy is fixed;
5. the discovery-to-mechanism workflow is fixed;
6. the parallel-agent split is fixed;
7. the worktree delivery rule is fixed;
8. sub-plans can be produced from this document without redefining the architecture.

## Open Questions

- What should be the final C++ shape of `AnchorDescriptor` and `StageDescriptor`?
- Should analysis artifacts remain human-reviewed inputs, or later become golden files?
- Which helper results should return `bool`, and which should return structured diagnostics?
- Which post-finalization phases are common enough to deserve shared abstractions?
- How much of the anchor-uniqueness proof should be encoded as automated tests versus documented assumptions?

## Next Step

Build family-specific sub-plans from this skeleton, starting only after the shared architecture decisions in this file are accepted.
