# HONK Recursion Family Plan

## Purpose

This file is the family-specific plan for `HONK` recursion.
It is derived from `recursion_constraints_plan.md`, which remains the master architecture skeleton.

This file should answer, for the HONK family:

1. what the baseline configuration is;
2. which files are the source of truth;
3. which tests are the main references;
4. which stages are core versus extension stages;
5. which anchor-gates look promising;
6. which helpers from `recursion_constraints_helper.hpp` are reusable;
7. what should happen next before implementation begins.

## 1. Baseline Configuration

### Baseline choice

The baseline configuration for the HONK family should be:

- `proof_type = HONK`
- `UltraRecursiveFlavor_<UltraCircuitBuilder>`
- `DefaultIO`
- constant-true predicate
- single recursive verification

### Why this is the baseline

This is the smallest configuration that still exercises the full recursive Ultra verifier pipeline:

- ACIR wrapper logic is present;
- Oink is present;
- padding and gate-challenge generation are present;
- Sumcheck is present;
- Shplemini is present;
- KZG reduction is present;
- pairing-point aggregation is present.

It avoids several extensions that would otherwise complicate the first family artifact:

- no ZK-only Gemini masking or Libra stages;
- no rollup proof splitting;
- no IPA propagation or finalization;
- no witness-predicate conditional assignment overhead.

### Why this is better than other HONK variants for the first artifact

- `HONK_ZK`
  - adds ZK-only stages and extra transcript activity;
  - better treated as a delta on top of baseline HONK.

- `ROLLUP_HONK`
  - adds `RollupIO`, split proof handling, and deferred IPA data;
  - should be modeled after baseline HONK is stable.

- `ROOT_ROLLUP_HONK`
  - further adds full recursive IPA verification during finalize;
  - belongs to extension work, not baseline structure discovery.

- witness-predicate modes
  - introduce `conditional_assign(...)`-based gates in the wrapper path;
  - useful later, but they obscure the cleanest baseline stage boundaries.

## 2. Source-Of-Truth Files

### Primary implementation files

- `barretenberg/cpp/src/barretenberg/dsl/acir_format/honk_recursion_constraint.cpp`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/recursion_constraint.cpp`
- `barretenberg/cpp/src/barretenberg/ultra_honk/oink_verifier.cpp`
- `barretenberg/cpp/src/barretenberg/ultra_honk/ultra_verifier.cpp`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/recursion_constraint_output.cpp`
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_constants.hpp`

### Why these files matter

- `honk_recursion_constraint.cpp`
  - defines `create_honk_recursion_constraints(...)`;
  - contains the wrapper logic that turns ACIR recursion data into stdlib objects;
  - contains write-VK and predicate-dependent behavior;
  - calls `verifier.verify_proof(proof_fields)`.

- `recursion_constraint.cpp`
  - dispatches between `HONK`, `HONK_ZK`, `ROLLUP_HONK`, and `ROOT_ROLLUP_HONK`;
  - confirms builder-dependent support:
    - `UltraCircuitBuilder` supports all four proof types;
    - `MegaCircuitBuilder` supports `HONK` and `HONK_ZK`, but not rollup proof types.

- `oink_verifier.cpp`
  - defines the first major verifier phase;
  - exposes transcript-derived challenges and commitment receives;
  - confirms that plain Ultra HONK does not include Mega-only ECC-op or databus commitment groups.

- `ultra_verifier.cpp`
  - defines the shared recursive verifier pipeline:
    - Oink
    - padding indicator array
    - gate challenges
    - Sumcheck
    - Shplemini
    - KZG reduction
    - public-input reconstruction and pairing aggregation
  - also defines rollup proof splitting and recursive output formation.

- `recursion_constraint_output.cpp`
  - defines the boundary between core verifier output and post-finalization logic;
  - important for separating baseline artifact stages from rollup/root-rollup extensions.

- `gate_count_constants.hpp`
  - already pins gate-count expectations for major HONK variants;
  - useful for distinguishing baseline and extension scenarios.

## 3. Reference Tests

### Primary HONK reference test

- `barretenberg/cpp/src/barretenberg/dsl/acir_format/honk_recursion_constraint.test.cpp`

This is the main source for:

- baseline scenarios;
- proof-type-dependent scenarios;
- predicate scenarios;
- rollup and root-rollup scenarios;
- gate-count expectations;
- tampering scenarios.

### Important scenario coverage already present there

- single recursive verification
- merge/base rollup (`ROLLUP_HONK`)
- root rollup (`ROOT_ROLLUP_HONK`)
- recursive verification of a non-recursive circuit and a recursive circuit
- predicate modes:
  - constant true
  - witness true
  - witness false
- gate count for single recursion
- gate count for root rollup
- tampering:
  - `VKHash`
  - `VK`
  - `Proof`

### Secondary structural references

- `barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/boomerang_chonk_recursion.test.cpp`
  - useful for artifact format and stage-by-stage analysis style;
  - not a direct HONK logic reference.

- `barretenberg/cpp/build-debug/oink_verifier_functions_data.txt`
- `barretenberg/cpp/build-debug/sumcheck_functions_data.txt`
- `barretenberg/cpp/build-debug/shplemini_functions_data.txt`
- `barretenberg/cpp/build-debug/kzg_functions_data.txt`
- `barretenberg/cpp/build-debug/megazk_functions_analysis.txt`
  - useful as structural examples of stage-oriented output;
  - must not be copied blindly into HONK because CHONK/MegaZK has additional stages.

## 4. Core Stages Versus Extension Stages

## 4.1 Core stages for the baseline HONK artifact

These stages should belong to the first `honk_functions_analysis.txt` baseline artifact.

### ACIR wrapper core

1. `HONK:ACIR:witness_load`
2. `HONK:ACIR:verifier_entry`

Notes:

- witness loading is always part of the wrapper flow;
- the baseline does not include predicate-based conditional assignment.

### Oink core

3. `Oink:vk_hash`
4. `Oink:num_public_inputs_assert`
5. `Oink:public_inputs`
6. `Oink:w_l`
7. `Oink:w_r`
8. `Oink:w_o`
9. `Oink:eta`
10. `Oink:lookup_read_counts`
11. `Oink:lookup_read_tags`
12. `Oink:w_4`
13. `Oink:beta_gamma`
14. `Oink:lookup_inverses`
15. `Oink:public_input_delta`
16. `Oink:z_perm`
17. `Oink:alpha`

### Preprocessor core

18. `HONK:Preprocessor:padding_indicator_array`
19. `HONK:Preprocessor:gate_challenges`

### Sumcheck core

20. `Sumcheck:initialize_target_sum`
21. `Sumcheck:u_i`
22. `Sumcheck:check_sum_i`
23. `Sumcheck:compute_next_target_sum_i`
24. `Sumcheck:gate_separators_partially_evaluate_i`

Notes:

- the exact number of rounds should remain symbolic in the plan until measured by the baseline boomerang test;
- plain HONK should not assume ZK-only Libra stages.

### Shplemini core

25. `Shplemini:rho`
26. `Shplemini:Gemini_fold_commitments`
27. `Shplemini:Gemini_r`
28. `Shplemini:Gemini_evaluation_challenge_powers`
29. `Shplemini:Shplonk_nu`
30. `Shplemini:Shplonk_batching_challenge_powers`
31. `Shplemini:Shplonk_Q`
32. `Shplemini:Shplonk_z`
33. `Shplemini:ClaimBatcher_compute_scalars`
34. `Shplemini:ClaimBatcher_update_batch_mul_inputs`
35. `Shplemini:finalize_batch_opening_claim`

### KZG core

36. `KZG:W_receive`
37. `KZG:masking_challenge`
38. `KZG:batch_mul`

### Output propagation core

39. `HONK:Output:reconstruct_from_public`
40. `HONK:Output:pairing_points_aggregate`

### Notes

- the baseline artifact should track the gate-generating recursive verifier pipeline itself;
- transcript-only stages may still appear in the artifact as stage labels without fingerprint ranges;
- the baseline should avoid post-finalization IPA logic.

## 4.2 Extension stages

These should be modeled after the baseline is understood.

### Predicate extensions

- `HONK:ACIR:predicate_conditional_assign`

This should be treated as a wrapper extension tied to witness-predicate modes, not as part of the cleanest baseline.

### Write-VK extension

- `HONK:ACIR:write_vk_populate`

This matters for VK-generation flows and should not define the baseline artifact.

### HONK_ZK extension

- `Oink:gemini_masking_commitment`
- `Sumcheck:Libra_concatenation_commitment`
- `Sumcheck:Libra_challenge`
- `Sumcheck:libra_correction`
- `Sumcheck:Libra_grand_sum_commitment`
- `Sumcheck:Libra_quotient_commitment`
- possible extra Shplemini-side ZK consistency stages

These are specific to `Flavor::HasZK` and should be modeled as a delta on top of plain HONK.

### Rollup extension

- `HONK:Verifier:split_rollup_proof`
- `HONK:Output:ipa_claim_propagation`

These are introduced by `RollupIO` and should not be merged into the baseline stage list.

### Root-rollup extension

- `HONK:Finalize:ipa_accumulate`
- `HONK:Finalize:full_ipa_verify_recursive`

These are root-rollup-specific finalization stages and belong to extension-only analysis.

## 5. Anchor-Gate Candidates

These are only candidates for now.
They still need discovery tests to justify uniqueness.

### Important note about transcript-derived challenges in HONK

HONK verification generates transcript-derived challenges throughout the verifier pipeline.
This matters because challenge-generation gates are currently the strongest candidates for structural anchors.

The major challenge-generation sites already visible in the code are:

- `eta`
- `beta`, `gamma`
- `alpha`
- `Sumcheck:gate_challenge`
- `rho`
- `Gemini_r`
- `Shplonk:nu`
- `Shplonk:z`
- `KZG:masking_challenge`

Architectural consequence:

- challenge-generation sites are the first class of anchor to investigate;
- commitment-receive stages should usually be treated as secondary context unless they prove uniquely identifiable;
- plain HONK is structurally better aligned with challenge-based anchoring than HN.

### Candidate A: Oink challenge-generation sites

Sources:

- `transcript->get_challenge<FF>("eta")`
- `transcript->get_challenges<FF>({ beta, gamma })`
- `transcript->get_challenge<FF>(domain_separator + "alpha")`

Why they look promising:

- they are central phase boundaries within Oink;
- in CHONK, challenge-generation gates were already useful anchors;
- they are more likely than commitment receives to expose unique structural gate patterns.

### Candidate B: gate-challenge generation for Sumcheck

Source:

- `transcript->get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", log_n)`

Why it looks promising:

- it sits exactly at the transition from Oink to Sumcheck;
- it is structurally central in the verifier;
- it likely produces a distinctive gate pattern suitable for anchoring.

### Candidate C: Shplemini challenge-generation sites

Sources:

- challenge generation around `rho`
- challenge generation around `Gemini_r`
- challenge generation around `Shplonk:nu`
- challenge generation around `Shplonk:z`

Why they look promising:

- they partition the Shplemini phase into meaningful subphases;
- they are likely stronger anchors than tail arithmetic chains alone;
- they already fit the helper style used by existing boomerang validators.

### Candidate D: KZG masking-challenge generation

Source:

- transcript challenge generation inside the KZG reduction flow

Why it looks promising:

- it forms a clean boundary inside KZG between receive and batch-mul logic;
- challenge-generation sites are often structurally more distinctive than equality assertions or copy constraints.

### Candidate E: KZG batch-mul region

Source:

- `PCS::reduce_verify_batch_opening_claim(...)` tail that leads into batch multiplication

Why it looks promising:

- batch-mul is typically one of the heaviest and most fingerprintable regions;
- even if the masking challenge becomes the anchor, the batch-mul region is likely to be the easiest large range to validate.

### Candidate F: padding-indicator computation

Source:

- `compute_padding_indicator_array(log_n)`

Why it looks promising:

- it is a single named pre-Sumcheck phase;
- it may expose a stable arithmetic fingerprint;
- it separates Oink from the Sumcheck setup.

### Pattern-rarity discovery test for HONK anchors

Before choosing the final HONK anchor set, add a discovery test that ranks gate patterns by rarity and then links rare
patterns back to protocol variables.

The test should:

1. build the baseline `HONK` recursion circuit;
2. run static analysis over the builder;
3. group gates by structural pattern;
4. rank patterns by frequency;
5. inspect the rarest patterns first;
6. collect witness indices touched by each rare pattern;
7. compare those witness indices with known HONK challenge witnesses and other important verifier variables.

The first variables to correlate against are:

- `eta`;
- `beta`;
- `gamma`;
- `alpha`;
- `Sumcheck:gate_challenge`;
- Sumcheck round challenges `u_i`;
- `rho`;
- `Gemini:r`;
- `Shplonk:nu`;
- `Shplonk:z`;
- `KZG:masking_challenge`;
- pairing-point accumulator components;
- rollup-only IPA claim components.

Interpretation rule:

- rare selector pattern alone is not enough;
- rare selector pattern plus a link to a known challenge witness is a strong candidate;
- rare selector pattern plus stable neighboring stage relationship is also a strong candidate;
- rare equality/copy-style gates should remain weak candidates unless linked structure makes them meaningful.

Validation rule:

Run the same discovery test across nearby HONK variants before promoting an anchor:

- baseline `HONK`;
- changed public-input size;
- `HONK_ZK`;
- `ROLLUP_HONK`;
- `ROOT_ROLLUP_HONK` if the anchor is expected to survive rollup finalization.

This test should produce a candidate-anchor report, not final descriptor constants.
Only after the report is stable should candidates be promoted into `AnchorDescriptor` entries and `FunctionFingerprint`
values.

### What looks weak as a primary anchor

- `assert_equal(...)`-style equality checks
- copy/equivalence constraints by themselves
- repeated commitment receive patterns like `w_l`, `w_r`, `w_o`

These may still be useful as secondary structural context, but should not be treated as strong primary anchors without proof.

## 6. Reusable Helpers From `recursion_constraints_helper.hpp`

## 6.1 Helpers that are clearly reusable

These are generic enough to be reused directly for HONK discovery and validation.

- `FunctionFingerprint`
- `calculate_hash_arithmetic_block(...)`
- `find_all_transcript_squeeze_gates(...)`
- `matches_fingerprint_at(...)`
- `find_fingerprint_range_containing_gate(...)`
- `find_fingerprint_range_containing_any_gate(...)`
- `find_fingerprint_range_at_or_after_any_gate(...)`
- `collect_linked_gates(...)`
- `validate_challenges_generation(...)`

These are the generic building blocks for fingerprint matching and challenge-anchored stage discovery.

## 6.2 Helpers reusable only by pattern, not directly as HONK validators

These namespaces encode the right style, but not the exact HONK baseline data:

- `OinkVerifierValidation`
- `SumcheckValidation`
- `ShpleminiVerification`
- `KZGVerification`

Why they should not be reused as-is:

- `OinkVerifierValidation` is currently MegaZK-oriented and includes CHONK/Mega-specific commitment groups;
- `SumcheckValidation`, `ShpleminiVerification`, and `KZGVerification` are coupled to fingerprints collected from the CHONK boomerang flow;
- plain HONK needs its own fingerprint constants even if it reuses the same validator structure.

What should be reused from them:

- result-struct style;
- stage-local validator design;
- anchor-to-fingerprint workflow;
- `write_stage_fingerprint(...)`-style thinking from boomerang tests.

## 7. Proof-Type Deltas To Preserve In The Plan

### `HONK`

- baseline family case;
- plain Ultra recursive verifier path;
- no ZK-only stages;
- no IPA split/finalization behavior.

### `HONK_ZK`

- same major pipeline as `HONK`;
- adds Gemini masking and Libra-related stages;
- needs its own fingerprint set.

### `ROLLUP_HONK`

- uses `RollupIO`;
- splits proof into HONK and IPA components;
- core verifier pipeline remains close to baseline HONK;
- output carries IPA data for later finalization.

### `ROOT_ROLLUP_HONK`

- same in-constraint verifier path as `ROLLUP_HONK`;
- diverges mainly in finalization with full recursive IPA verification.

### Builder-dependent constraint

- `UltraCircuitBuilder` supports all four HONK proof types;
- `MegaCircuitBuilder` supports only `HONK` and `HONK_ZK`.

This must be preserved in any later descriptor or mechanism design.

## 8. What CHONK Covers Versus What HONK Must Re-Measure

CHONK is a strong architectural reference for HONK, but it is not a drop-in source of exact HONK stage data.

### What CHONK already covers well

CHONK already provides a strong template for the overall verifier shape:

- `Oink`
- `Padding / gate-challenge preprocessing`
- `Sumcheck`
- `Shplemini`
- `KZG`

It also already demonstrates:

- the artifact format for `*_functions_analysis.txt`;
- the idea of splitting one verifier into named stages;
- the idea of using transcript-derived challenge generation as possible anchors;
- the style of validator design built around `FunctionFingerprint`, linked-gate tracing, and per-stage checks.

Architectural consequence:

- CHONK is the main reference for the structure of a HONK boomerang-analysis test;
- CHONK is also the main reference for how to organize stage-local validators.

### What only transfers conceptually

Some parts of CHONK should be reused only at the level of ideas, not copied directly:

- ACIR wrapper structure;
- exact Oink stage boundaries;
- transcript-only stage labeling;
- output aggregation stages.

These concepts are useful, but the exact stage contents for HONK still need to be confirmed in the HONK code path.

### What HONK must re-measure explicitly

The following must be rediscovered or re-measured for HONK itself:

- the exact `FunctionFingerprint` values for HONK stages;
- the exact baseline stage list for plain `HONK`;
- the exact Sumcheck round count and tail stages for the chosen baseline circuit;
- the exact Shplemini tail stages that are fingerprinted versus transcript-only;
- the exact KZG fingerprint ranges for HONK;
- the exact Oink commitment grouping for plain Ultra HONK;
- the `HONK_ZK`-specific additions;
- the `ROLLUP_HONK` proof-splitting and IPA-propagation effects;
- the `ROOT_ROLLUP_HONK` finalize/IPA verification stages.

### What must not be copied directly from CHONK

The following CHONK-specific details should not be transferred into HONK without dedicated tests:

- Mega-only ECC-op commitment stages;
- databus commitment stages;
- databus inverse commitment stages;
- MegaZK-specific Libra stages in the plain HONK baseline;
- exact gate counts;
- exact block fingerprints.

### Practical rule

Use CHONK as:

- the architectural skeleton;
- the artifact-format reference;
- the validator-style reference.

Do not use CHONK as:

- the source of HONK fingerprint constants;
- the source of HONK-specific anchor proofs;
- the source of HONK rollup/root-rollup finalization stages.

Short version:

- CHONK covers most of the verifier skeleton for HONK;
- HONK still needs its own stage map, fingerprints, and anchor validation.

## 9. Open Questions Before Mechanism Work

1. Which challenge-generation site is the strongest first anchor for baseline HONK:
   `eta`, `beta/gamma`, `alpha`, `Sumcheck:gate_challenge`, or `KZG:masking_challenge`?
2. Which commitment-receive stages are still worth validating directly, even if they are not used as anchors?
3. Which Sumcheck tail stages exist in the plain HONK baseline and should be named explicitly in the first artifact?
4. Which Shplemini tail stages are transcript-only versus fingerprinted?
5. Should the first extension after baseline be `HONK_ZK` or `ROLLUP_HONK`?

## 10. Immediate Next Steps

Follow this order:

1. build a baseline HONK analysis test for the plain `HONK` case;
2. emit `honk_functions_analysis.txt`;
3. identify candidate anchor-gates from that artifact;
4. write anchor-uniqueness tests for the best candidates;
5. define HONK-specific `FunctionFingerprint` values;
6. create the HONK family namespace file;
7. implement one validator at a time, each with its own focused test.
