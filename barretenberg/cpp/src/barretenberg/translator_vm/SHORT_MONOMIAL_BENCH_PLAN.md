# Translator Short-Monomial Benchmark Plan

## Goal

Measure whether the Translator sumcheck prover benefits from the same short-monomial edge representation used by
Ultra/Mega.

The experiment should keep the existing Translator proving path intact, add a duplicate short-monomial path, and compare
correctness and benchmark results before deciding whether the duplicate path should replace the current implementation.

## Background

`TranslatorFlavor` currently sets `USE_SHORT_MONOMIALS = false`, so `SumcheckProverRound::extend_edges()` eagerly
extends every edge from two Boolean values to `MAX_PARTIAL_RELATION_LENGTH` before relation accumulation.

Ultra/Mega set `USE_SHORT_MONOMIALS = true`, so each edge is passed to the relation code as `Univariate<FF, 2>`.
Relations that are short-monomial aware then do low-degree arithmetic in coefficient basis and only materialize longer
univariates for the actual subrelation accumulators.

The Translator relations are good benchmark candidates because the prover spends meaningful time in sumcheck, but the
existing relations assume full extended edges. The first implementation should therefore duplicate the relations instead
of mutating them in place.

## Constraints

- Preserve the current `TranslatorFlavor`, proof format, fixed VK path, and Chonk integration while benchmarking.
- Add duplicate relation implementations with explicit short-monomial support.
- Prove equivalence against the existing relations before wiring the duplicate flavor into a prover.
- Keep relation algebra identical at the subrelation accumulator boundary.
- Do not update constants, fixed VKs, proof-size constants, proof layout, or transcript layout. Any such change means the
  experiment has escaped its intended scope.

## Work Plan

### 1. Inventory the Current Translator Relation Surface

- List the current `TranslatorFlavor::Relations_` tuple:
  - `TranslatorPermutationRelation`
  - `TranslatorDeltaRangeConstraintRelation`
  - `TranslatorOpcodeConstraintRelation`
  - `TranslatorAccumulatorTransferRelation`
  - `TranslatorDecompositionRelation`
  - `TranslatorNonNativeFieldRelation`
  - `TranslatorZeroConstraintsRelation`
- Record each relation's `SUBRELATION_PARTIAL_LENGTHS`.
- Identify relation terms that currently rely on full edge evaluation through `Accumulator` construction from already
  extended inputs.
- Identify low-degree inputs that can be represented as `Accumulator::CoefficientAccumulator`.
- Confirm that `MAX_PARTIAL_RELATION_LENGTH` and `BATCHED_RELATION_PARTIAL_LENGTH` remain unchanged for the duplicate
  relation tuple.

### 2. Add Short-Monomial Relation Duplicates

- Create duplicate relation headers and implementation files under `relations/translator_vm/`.
- Use a consistent suffix such as `Short` or `ShortMonomial`, for example:
  - `TranslatorPermutationShortRelation`
  - `TranslatorDeltaRangeConstraintShortRelation`
  - `TranslatorOpcodeConstraintShortRelation`
  - `TranslatorAccumulatorTransferShortRelation`
  - `TranslatorDecompositionShortRelation`
  - `TranslatorNonNativeFieldShortRelation`
  - `TranslatorZeroConstraintsShortRelation`
- Keep the public relation contract the same:
  - same subrelation ordering,
  - same `SUBRELATION_PARTIAL_LENGTHS`,
  - same `SUBRELATION_LINEARLY_INDEPENDENT` behavior,
  - same `skip()` behavior where present.
- In each duplicate relation, convert degree-1 edge inputs to coefficient basis with
  `typename Accumulator::CoefficientAccumulator` before doing algebra where possible.
- Materialize `Accumulator` only when the expression degree requires the subrelation accumulator length.
- Preserve the existing relation files untouched during the first pass.

### 3. Add Relation Consistency Tests

- Extend or duplicate `translator_relation_consistency.test.cpp`.
- For every relation pair, feed the same inputs to:
  - the existing relation with `TranslatorFlavor::AllValues`,
  - the short-monomial relation with `TranslatorShortMonomialFlavor::AllValues` or a direct short-edge fixture.
- Compare every subrelation accumulator exactly.
- Test at least:
  - deterministic non-random input,
  - random scalar input,
  - structured edge input where `Univariate<FF, 2>` is extended with `extend_to<MAX_PARTIAL_RELATION_LENGTH>()` and
    compared to the existing full-edge relation result.
- Include selector and shifted-column cases, since Translator has many relations that depend on shifted values and
  Lagrange selectors.

### 4. Create a Duplicate Translator Flavor

- Add a benchmark-only flavor next to `TranslatorFlavor`, for example `TranslatorShortMonomialFlavor`.
- Reuse all entity containers, PCS lists, commitment labels, VK structure, evaluation partitioning, and reconstruction
  helpers from `TranslatorFlavor`.
- Override only the pieces needed for the experiment:
  - `USE_SHORT_MONOMIALS = true`,
  - `Relations_ = std::tuple<...ShortRelation<FF>>`,
  - derived relation constants must evaluate to the same values as `TranslatorFlavor`.
- Confirm the duplicate flavor still satisfies:
  - `BATCHED_RELATION_PARTIAL_LENGTH == Curve::LIBRA_UNIVARIATES_LENGTH`,
  - `MAX_PARTIAL_RELATION_LENGTH == TranslatorFlavor::MAX_PARTIAL_RELATION_LENGTH`,
  - `BATCHED_RELATION_PARTIAL_LENGTH == TranslatorFlavor::BATCHED_RELATION_PARTIAL_LENGTH`,
  - PCS entity counts,
  - repeated commitment index assumptions,
  - mid-sumcheck evaluation partition assumptions.

### 5. Wire a Duplicate Prover Path

Add enough scaffolding for one process to construct and run both prover variants from the same generated Translator input.

- Template the prover implementation over the flavor, for example:
  - `template <typename Flavor> class TranslatorProver_`,
  - `using TranslatorProver = TranslatorProver_<TranslatorFlavor>`,
  - `using TranslatorShortMonomialProver = TranslatorProver_<TranslatorShortMonomialFlavor>`.
- If needed, apply the same pattern to the proving-key type:
  - keep the existing `TranslatorProvingKey` alias for production,
  - add a `TranslatorShortMonomialProvingKey` alias only if the flavor type is baked into the key type,
  - avoid duplicating polynomial storage or commitment data just to select the relation tuple.
- Keep the production `TranslatorProver` defaulting to `TranslatorFlavor`.
- Factor shared setup into helper functions that are flavor-independent:
  - Ultra op queue generation at a requested capacity,
  - Translator circuit builder construction,
  - proving key construction,
  - transcript construction,
  - relation parameter initialization.
- Add a test/benchmark helper that accepts a flavor type and returns the relevant outputs:
  - constructed proof or proof result,
  - `sumcheck_output`,
  - `zk_sumcheck_data`,
  - accumulated result,
  - timing labels emitted by the benchmark harness.
- Add one entry point that calls the helper twice for each input:
  - once with `TranslatorFlavor`,
  - once with `TranslatorShortMonomialFlavor`.
- Ensure both calls consume the same Ultra op input and equivalent proving-key polynomial data.
- Keep verifier wiring scoped to tests/benchmarks at first. If the proof transcript is unchanged, the existing verifier
  may work with a matching duplicate flavor, but this should not be assumed until transcript and proof-length tests pass.

### 6. Prover Consistency Tests

- Add a test that builds the same Translator proving key and runs both:
  - existing `TranslatorProver`,
  - short-monomial duplicate prover.
- Compare:
  - sumcheck challenges,
  - claimed evaluations,
  - Libra claimed evaluations,
  - final accumulated result,
  - verifier success for both paths.
- If transcripts diverge because relation arithmetic is rearranged but still equivalent, compare semantic outputs rather
  than byte-for-byte proofs.
- Keep existing failure tests running against the original flavor. Add only targeted duplicate-flavor failure coverage
  for relation equivalence and full proof verification.

### 7. Build and Test Loop

- Build target:
  - `cd barretenberg/cpp`
  - `cmake --preset default`
  - `cmake --build build --target translator_vm_tests`
- Run focused tests first:
  - `build/bin/translator_vm_tests --gtest_filter='*RelationConsistency*'`
  - `build/bin/translator_vm_tests --gtest_filter='*Translator*Short*:*TranslatorTests.Basic*'`
- Then run the full Translator test binary:
  - `build/bin/translator_vm_tests`

### 8. Benchmarking

- Add or extend one benchmark suite that runs both Translator flavor paths in the same binary. Do not require branch
  switching to compare the old and short-monomial implementations.
- The benchmark matrix should use identical Ultra op inputs at three Translator capacity points:
  - 1/4 capacity filled with Ultra ops,
  - 1/2 capacity filled with Ultra ops,
  - 3/4 capacity filled with Ultra ops.
- For each capacity point, run both prover paths side by side:
  - current full-edge `TranslatorFlavor`,
  - duplicate `TranslatorShortMonomialFlavor`.
- Keep input generation shared so the only variable is the Translator flavor/relation implementation.
- Capture at least:
  - total Translator proving time,
  - `TranslatorProver::execute_relation_check_rounds`,
  - sumcheck round time,
  - peak memory if the benchmark path supports `--memory_profile_out`.
- Prefer remote benchmark runs for final numbers:
  - `cd barretenberg/cpp`
  - `./scripts/benchmark_remote.sh <translator_benchmark_target>`
- Report relative speedup and absolute timings for every capacity point:
  - old 1/4 vs short-monomial 1/4,
  - old 1/2 vs short-monomial 1/2,
  - old 3/4 vs short-monomial 3/4.

## Open Questions

- Should the duplicate prover be a separate class, or should `TranslatorProver` become `TranslatorProver_<Flavor>` with
  `using TranslatorProver = TranslatorProver_<TranslatorFlavor>`?
- Which benchmark target should own the Translator prover benchmark: an existing Goblin/Translator benchmark or a new
  focused target?
- Do any Translator relation degrees increase when rewritten in coefficient basis, or do all duplicate relations preserve
  the current `MAX_PARTIAL_RELATION_LENGTH`?
- Should the duplicate verifier be added immediately, or only after prover-side sumcheck equivalence is established?

## Done Criteria

- Short-monomial duplicate relations compile.
- Relation consistency tests prove equality against existing relations.
- Duplicate Translator flavor compiles with `USE_SHORT_MONOMIALS = true`.
- Duplicate prover constructs a proof and verifies in a test-scoped path.
- Remote benchmark results compare current and short-monomial Translator proving paths on the same input.
