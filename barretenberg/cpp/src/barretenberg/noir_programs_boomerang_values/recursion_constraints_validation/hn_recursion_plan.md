# HN Recursion Family Plan

## Purpose

This file is the family-specific plan for `HN / Hypernova recursion`.
It is derived from `recursion_constraints_plan.md`, which remains the master architecture skeleton.

This file should answer, for the HN family:

1. what the baseline configuration is;
2. which files are the source of truth;
3. which tests are the main references;
4. which stages are core versus extension stages;
5. which anchor-gates look promising;
6. which helpers from `recursion_constraints_helper.hpp` are reusable;
7. what should happen next before implementation begins.

## 1. Baseline Configuration

### Baseline choice

The baseline configuration for the HN family should be:

- `MegaCircuitBuilder`
- one `HN` recursion constraint
- kernel verification path
- no tail-kernel hiding logic
- no hiding-kernel decider logic
- no multi-constraint inner-kernel composition

In practical terms, the cleanest baseline is the `RESET kernel` scenario:

- single constraint;
- proof type `HN`;
- kernel-side IO handling;
- folding verification is present;
- databus consistency checks are present;
- accumulator-hash propagation is present;
- no tail-only or hiding-only extras are added.

### Why this is the baseline

This is the smallest configuration that still exercises the real HN kernel path.

It is better than:

- `INIT kernel`, because `OINK` is a special first-app case rather than the main HN folding case;
- `INNER kernel`, because it has two HN constraints and mixes two recursive verifications;
- `TAIL kernel`, because it adds hiding-related ECC-op queue logic;
- `HIDING kernel`, because it adds decider verification and different output propagation.

## 2. Source-Of-Truth Files

### Primary implementation files

- `barretenberg/cpp/src/barretenberg/dsl/acir_format/recursion_constraint.cpp`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/hypernova_recursion_constraint.cpp`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp`
- `barretenberg/cpp/src/barretenberg/chonk/chonk.cpp`
- `barretenberg/cpp/src/barretenberg/chonk/chonk.hpp`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/recursion_constraint_output.cpp`

### Why these files matter

- `recursion_constraint.cpp`
  - routes `hn_recursion_constraints` into `process_hn_recursion_constraints(...)`;
  - confirms HN is supported only on `MegaCircuitBuilder`;
  - confirms HN is incompatible with simultaneous HONK recursion constraints in the same builder flow.

- `hypernova_recursion_constraint.cpp/.hpp`
  - defines mock-state creation for VK-generation and `write_vk` paths;
  - defines the allowed kernel patterns:
    - `INIT` with `OINK`
    - `RESET` with `HN`
    - `INNER` with two `HN`
    - `TAIL` with `HN_TAIL`
    - `HIDING` with `HN_FINAL`

- `chonk.cpp/.hpp`
  - contains the real recursive kernel verification flow;
  - defines `instantiate_stdlib_verification_queue(...)`;
  - defines `perform_recursive_verification_and_databus_consistency_checks(...)`;
  - defines `complete_kernel_circuit_logic(...)`;
  - defines kernel-type-dependent behavior and output propagation.

- `recursion_constraint_output.cpp`
  - matters for architectural boundaries;
  - confirms that HN public inputs are already handled by IVC logic when finalizing with `MegaCircuitBuilder`.

## 3. Reference Tests

### Primary HN reference test

- `barretenberg/cpp/src/barretenberg/dsl/acir_format/hypernova_recursion_constraint.test.cpp`

This is the main source for:

- baseline scenarios;
- allowed proof-type combinations;
- expected kernel patterns;
- gate-count expectations;
- boundary-condition failures.

### Important scenario coverage already present there

- init kernel (`OINK`)
- reset kernel (`HN`)
- inner kernel (`HN + HN`)
- tail kernel (`HN_TAIL`)
- hiding kernel (`HN_FINAL`)
- gate count checks
- malformed public inputs rejection
- proof-type mismatch rejection

### Secondary structural references

- `barretenberg/cpp/src/barretenberg/chonk/chonk_transcript_invariants.test.cpp`
  - useful for transcript boundaries and stage grouping;
  - useful for understanding which transcript activity is structurally stable.

- `barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/boomerang_chonk_recursion.test.cpp`
  - useful as a formatting and artifact-generation reference;
  - not a direct HN logic reference.

## 4. Core Stages Versus Extension Stages

## 4.1 Core stages for the baseline HN artifact

These stages should belong to the first `hn_functions_analysis.txt` baseline artifact.

### Setup and queue materialization

1. `HN:instantiate_stdlib_verification_queue`
2. `HN:kernel_type_detection`
3. `HN:queue_ecc_eq`

### Recursive verification core

4. `HN:Folding:verify_folding_proof`
5. `HN:KernelIO:reconstruct_from_public`
6. `HN:Databus:kernel_return_data_assert`
7. `HN:Databus:app_return_data_assert`
8. `HN:Accumulator:hash_assert`
9. `HN:Merge:recursively_verify_merge`

### Output propagation core

10. `HN:Output:pairing_points_aggregate`
11. `HN:Output:kernel_io_set_public`

### Notes

- For the baseline `RESET kernel`, the folding stage should use the `verify_folding_proof(...)` path.
- `KernelIO` reconstruction and databus checks are core to the kernel HN path and should not be treated as optional extras.
- The accumulator-hash check is structurally important and likely one of the best HN-specific anchors.

## 4.2 Extension stages

These should be modeled after the baseline is understood.

### Init-kernel extension

- `HN:Init:instance_to_accumulator`

This belongs to the `OINK` first-app case and should not define the HN baseline.

### Inner-kernel extension

- repeated execution of the HN kernel verification loop for two queue entries

This is structurally important, but not needed for the first baseline artifact.

### Tail-kernel extension

- `HN:Tail:queue_ecc_no_op`
- `HN:Tail:hide_op_queue_content_in_tail`
- `HN:Tail:hide_op_queue_accumulation_result`

These are tail-specific ECC-op queue hiding stages and should be treated as extensions.

### Hiding-kernel extension

- `HN:Hiding:decider_verify`
- `HN:Hiding:hide_op_queue_content_in_hiding`
- `HN:Hiding:pairing_points_aggregate`
- `HN:Hiding:hiding_kernel_io_set_public`

These are specific to `HN_FINAL` and should not be merged into the baseline stage list.

## 5. Anchor-Gate Candidates

These are only candidates for now.
They still need discovery tests to justify uniqueness.

### Important note about transcript-derived challenges in HN

HN verification does generate transcript-derived challenges.
This matters because challenge-generation gates may become useful anchors for locating parts of the HN flow.

However, unlike the CHONK boomerang baseline, the challenge logic is spread across several verifier layers:

- `barretenberg/cpp/src/barretenberg/hypernova/hypernova_verifier.cpp`
- `barretenberg/cpp/src/barretenberg/hypernova/hypernova_batching_challenges.hpp`
- `barretenberg/cpp/src/barretenberg/multilinear_batching/multilinear_batching_verifier.cpp`

The currently confirmed transcript-derived challenges are:

- `HypernovaFoldingProver:gate_challenge`
  - generated via `get_dyadic_powers_of_challenge(...)`
  - used during HyperNova sumcheck preparation
- `unshifted_challenge_i`
  - generated via `get_challenges(...)`
  - used for HyperNova batching of unshifted entities
- `shifted_challenge_i`
  - generated via `get_challenges(...)`
  - used for HyperNova batching of shifted entities
- `Sumcheck:alpha`
  - generated inside multilinear batching verification
- `claim_batching_challenge`
  - generated inside multilinear batching verification

At the same time, some similarly named values are not transcript-generated on the verifier side.
For example, `accumulator_challenge_i` is received from the prover rather than produced by Fiat-Shamir in the verifier.

Architectural consequence:

- challenge-based anchors are plausible for HN;
- but they must be classified carefully by layer;
- and they must be distinguished from transcript receives.

This means the HN family should not assume a single CHONK-like challenge-anchor pattern.
Instead, discovery tests should check whether any of these challenge-generation sites produce selector patterns or
linked-gate structures that are unique enough to anchor:

- HyperNova gate-challenge generation;
- HyperNova batching-challenge generation;
- multilinear batching challenge generation.


### Candidate B: databus consistency region around return-data checks

Sources:

- `kernel_input.kernel_return_data.incomplete_assert_equal(witness_commitments.calldata)`
- `kernel_input.app_return_data.incomplete_assert_equal(witness_commitments.secondary_calldata)`

Why this is weaker than it first appeared:

- `incomplete_assert_equal(...)` is implemented in `biggroup.hpp` using `assert_equal(...)` on the infinity flag,
  x coordinate, and y coordinate;
- `assert_equal(...)` often behaves like a copy/equivalence constraint and may not generate a strong standalone gate
  pattern;
- this makes the equality checks weak candidates for direct anchor-gates.

Architectural consequence:

- treat these checks as semantically important HN validation steps;
- do not treat them as primary anchor-gates;
- if they are used at all, use them only as secondary structural context around a stronger nearby anchor.

### Candidate C: merge recursive verification entry

Source:

- `goblin.recursively_verify_merge(...)`

Why it looks promising:

- it is a major HN-specific phase boundary;
- it follows the folding/databus path and precedes output propagation;
- it may expose unique transcript or gate patterns.

### Candidate D: tail-kernel hiding ops

Sources:

- `queue_ecc_no_op()`
- `hide_op_queue_content_in_tail(...)`
- `hide_op_queue_accumulation_result(...)`

Why they look promising:

- they are tail-only;
- they may create unique ECC-op queue gate patterns;
- they could be strong anchors for extension-only stages.

### Candidate E: hiding-kernel decider verification

Source:

- `decider_verifier.verify_proof(...)`

Why it looks promising:

- it exists only in `HN_FINAL`;
- it creates a clear boundary between folding verification and hiding-kernel finalization.

### Candidate F: transcript-challenge generation sites

Sources:

- `get_dyadic_powers_of_challenge("HypernovaFoldingProver:gate_challenge", ...)`
- `get_challenges(...)` in `get_hypernova_batching_challenges(...)`
- `get_challenge("Sumcheck:alpha")`
- `get_challenge("claim_batching_challenge")`

Why they look promising:

- they may generate structurally distinctive gate patterns;
- they may separate major HN subphases from each other;
- they could play the same architectural role for HN that challenge-generation gates played for CHONK.

Why they are not confirmed yet:

- they are distributed across several verifier layers rather than one local stage cluster;
- some neighboring transcript operations are receives rather than challenge generations;
- their selector uniqueness still needs to be proven with dedicated tests.

### Pattern-rarity discovery test for HN anchors

HN needs an explicit discovery test because its useful anchors are less obvious than in plain HONK.
The verification logic is spread across folding, batching, databus, merge, accumulator, and kernel-IO code paths.

The test should:

1. build the baseline HN recursion circuit, starting with the `RESET kernel`;
2. run static analysis over the builder;
3. group gates by structural pattern;
4. rank patterns by frequency;
5. inspect the rarest patterns first;
6. collect witness indices touched by each rare pattern;
7. compare those witness indices with known HN protocol variables.

The first variables to correlate against are:

- HyperNova folding challenges;
- HyperNova batching challenges;
- multilinear batching challenges;
- verifier accumulator values;
- merge-verification outputs;
- kernel return-data commitments;
- app return-data commitments;
- ECC-op table commitments;
- output accumulator hash components.

Important caution:

- rare equality gates around `assert_equal(...)` or `incomplete_assert_equal(...)` are not strong anchors by themselves;
- rare gates touching transcript receives should be classified separately from gates touching generated challenges;
- rare patterns created only by kernel-type branching should not be promoted unless they survive the intended kernel
  scenario.

Validation rule:

Run the same discovery test across nearby HN variants before promoting an anchor:

- `RESET kernel`;
- `INIT kernel`;
- `INNER kernel`;
- `TAIL kernel`;
- `HIDING kernel`.

For HN, a candidate should be promoted only when the test shows both:

1. a rare structural pattern;
2. a meaningful link to a protocol variable or stable phase boundary.

This test should produce a candidate-anchor report first.
Only later should stable candidates become `AnchorDescriptor` entries and HN-specific `FunctionFingerprint` values.

### What is not yet a confirmed anchor

- transcript events alone;
- queue size checks;
- kernel type booleans;
- comments or conceptual phase names.

All of these still need structural confirmation from discovery tests.

## 6. Reusable Helpers From `recursion_constraints_helper.hpp`

## 6.1 Helpers that are clearly reusable

These are generic enough to be reused for HN discovery and validation.

- `calculate_hash_arithmetic_block(...)`
- `find_all_transcript_squeeze_gates(...)`
- `matches_fingerprint_at(...)`
- `find_fingerprint_range_containing_gate(...)`
- `find_fingerprint_range_containing_any_gate(...)`
- `find_fingerprint_range_at_or_after_any_gate(...)`
- `collect_linked_gates(...)`
- `validate_challenges_generation(...)`
- `FunctionFingerprint`

These helpers are not specific to HONK/CHONK semantics; they provide the generic matching and graph-tracing substrate.

## 6.2 Helpers that are reusable by pattern, but not directly as HN validators

These namespaces show the right validator style, but should not be copied as-is:

- `OinkVerifierValidation`
- `SumcheckValidation`
- `ShpleminiVerification`
- `KZGVerification`

Why:

- they encode protocol-specific fingerprints and assumptions;
- HN is centered on folding / merge / databus / kernel-IO flow rather than plain Oink-Sumcheck-Shplemini-KZG slicing.

What should be reused from them:

- result-struct style;
- stage-local validator design;
- anchor-to-fingerprint workflow;
- helper composition pattern.

## 6.3 Helpers that may be reusable only for sub-parts

These need confirmation later:

- transcript squeeze extraction for HyperNova folding or merge substeps;
- challenge-generation validation if HN subprotocols expose stable squeeze-based anchor gates;
- block-delta/fingerprint writing utilities already used in `boomerang_chonk_recursion.test.cpp`.

## 7. Open Questions Before Mechanism Work

1. Which HN baseline stage should generate the first reliable anchor:
   accumulator hash, databus equality, or merge verification?
2. Does HyperNova folding expose stable challenge-generation gates that can be reused as primary anchors, similar to CHONK?
3. Should `INIT kernel` be treated as part of the HN family plan from the start, or as a separate `OINK-in-HN-context` extension?
4. Which HN stages are transcript-only and therefore should be represented without fingerprint ranges?
5. Which extension should be implemented first after the baseline:
   `INNER`, `TAIL`, or `HIDING`?

## 8. Immediate Next Steps

Follow this order:

1. build a baseline HN analysis test for the `RESET kernel` case;
2. emit `hn_functions_analysis.txt`;
3. identify candidate anchor-gates from that artifact;
4. write anchor-uniqueness tests for the best candidates;
5. define HN-specific `FunctionFingerprint` values;
6. create the HN family namespace file;
7. implement one validator at a time, each with its own focused test.
