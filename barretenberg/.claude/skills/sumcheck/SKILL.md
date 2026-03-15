---
name: sumcheck
description: Comprehensive reference for the Sumcheck protocol implementation in barretenberg. Use when working on sumcheck prover/verifier, relations, ZK sumcheck (Libra/row disabling), ECCVM committed sumcheck, flavors, gate separator, partial evaluation, or any code in the sumcheck/ directory and its integrations.
---

# Sumcheck Protocol Implementation

## Overview

Sumcheck is the core interactive proof protocol (made non-interactive via Fiat-Shamir) that reduces a multilinear polynomial identity over a boolean hypercube `{0,1}^d` to a single-point evaluation. It is the central component of the Honk proving system.

**Claim**: `sum_{X in {0,1}^d} pow_beta(X) * F(P_1(X), ..., P_N(X)) = 0`

where `P_i` are multilinear witness/selector polynomials, `F` is the batched relation polynomial, and `pow_beta` is the gate separator polynomial.

## Code Layout

### Core: `barretenberg/cpp/src/barretenberg/sumcheck/`

- `sumcheck.hpp` — Prover, Verifier, and compile-time handler structs
- `sumcheck_round.hpp` — Per-round logic for both prover and verifier
- `sumcheck_output.hpp` — Output struct (challenge vector, claimed evaluations, ZK data)
- `zk_sumcheck_data.hpp` — Libra masking polynomials and running sums
- `masking_tail_data.hpp` — ZK masking values stored separately from short witness polys
- `Sumcheck.md` — Detailed mathematical documentation

### Supporting:

- `polynomials/gate_separator.hpp` — pow_beta polynomial
- `polynomials/row_disabling_polynomial.hpp` — ZK row masking
- `flavor/partially_evaluated_multivariates.hpp` — Book-keeping table for partial evaluation
- `flavor/flavor_concepts.hpp` — Flavor dispatch concepts
- `relations/` — Relation types, utilities, parameters, nested containers
- `stdlib/primitives/padding_indicator_array/` — Recursive padding indicator computation

### Tests:

- `sumcheck/sumcheck.test.cpp` — Prover/verifier correctness, ZK, Grumpkin, failure cases
- `sumcheck/sumcheck_round.test.cpp` — Round-level: univariates, batching, check_sum, padding
- `ultra_honk/sumcheck.test.cpp` — Integration test with real UltraFlavor circuit

### Callers:

- `ultra_honk/ultra_prover.cpp` / `ultra_verifier.cpp` — Ultra/Mega/MegaZK flavors
- `eccvm/eccvm_prover.cpp` / `eccvm_verifier.cpp` — Grumpkin committed sumcheck
- `hypernova/` — HyperNova folding
- `chonk/batched_honk_translator/` — Batched Honk+Translator

## Architecture

### Proving Pipeline

```
OINK PHASE (pre-sumcheck)
  Commit to wires, lookup counts, log-deriv inverses, permutation product.
  Draw alpha (subrelation separator) and gate challenges (beta_0,...,beta_{d-1}).

SUMCHECK PHASE
  For round i = 0..d-1:
    Compute round univariate (extend edges, accumulate relations, batch with pow)
    [ZK] Add Libra masking contribution, subtract row disabling correction
    Send round univariate to transcript, draw challenge u_i
    Partially evaluate all polynomials at u_i
  [Padding] For round i = d..virtual_log_n-1:
    Send zero/virtual univariate, draw challenge
  Extract claimed evaluations from top of book-keeping table

PCS PHASE (post-sumcheck)
  [ZK] SmallSubgroupIPA proves Libra evaluation
  Shplemini reduces multivariate opening claims to univariate
  KZG/IPA proves the univariate opening
```

### Key Design Patterns

**Compile-time flavor dispatch**: The `Flavor` template parameter bundles all configuration. Handler structs (`RoundUnivariateHandler`, `VerifierZKCorrectionHandler`) use `if constexpr` and specializations to select behavior at compile time based on flavor traits.

**Prover round structure**: Each round extends polynomial evaluations from `{0,1}` to `{0,...,D}`, accumulates relation contributions into univariate accumulators, then batches over relations using alpha powers and the gate separator factor.

**Verifier round structure**: Each round checks `S(0) + S(1) == target_sum`, then computes the next target as `S(u_i)`. The final step evaluates the full batched relation at the challenge point and compares.

**Committed sumcheck** (Grumpkin/ECCVM path): Instead of sending round univariate evaluations in the clear, the prover commits to each round univariate and sends the commitment plus evaluations at `{0, 1}` only. The verifier does NOT perform the usual `check_sum` and `compute_next_target_sum` during sumcheck — it defers all consistency checks to the PCS phase, where Shplemini batch-verifies the round univariate commitments together with the polynomial opening claims. This is controlled by `IsGrumpkinFlavor` and handled via the `RoundUnivariateHandler` and `SumcheckVerifierRound` specializations.

**Book-keeping table**: Partial evaluation halves the polynomial table each round. After `d` rounds, a single row remains holding the claimed evaluations at the challenge point.

## Flavor System

Each flavor provides a compile-time configuration bundle that parameterizes sumcheck.

### Key Flavor Traits

| Trait | Effect on Sumcheck |
|-------|-------------------|
| `Relations` | Tuple of relation types composing the Honk relation |
| `MAX_PARTIAL_RELATION_LENGTH` | Determines round univariate degree |
| `BATCHED_RELATION_PARTIAL_LENGTH` | MAX+1 (non-ZK) or MAX+2 (ZK, for row disabling) |
| `HasZK` | Enables Libra masking + row disabling |
| `NUM_SUBRELATIONS` | Total subrelation count, determines alpha array size |

### Dispatch Points

| Concept | Dispatch |
|---------|----------|
| `HasZK` | ZK prove path (Libra + row disabling) |
| `IsGrumpkinFlavor` | Committed sumcheck (commit round univariates) |
| `isAvmFlavor` | Chunked threading strategy |
| `UseRowDisablingPolynomial` | Row disabling corrections (false for Translator) |
| `IsTranslatorFlavor` | Mid-sumcheck mini-circuit evaluations |
| `isMultilinearBatchingFlavor` | No pow polynomial, uses eq polynomials |
| `IsRecursiveFlavor` | Uses `assert_equal` for constraint checks |

## Relations System

A **relation** is a polynomial constraint (or set of sub-constraints) that must hold across the execution trace. Each relation has:

- `SUBRELATION_PARTIAL_LENGTHS` — array of algebraic degrees per subrelation
- `SUBRELATION_LINEARLY_INDEPENDENT` — controls whether each subrelation is multiplied by pow_beta
- `accumulate()` — evaluates the relation given extended edges and parameters
- `skip()` (optional) — returns true when a row contributes nothing

### Subrelation Independence

- **Linearly independent** (default): must hold at every row; multiplied by pow_beta
- **Linearly dependent** (e.g., lookup sum identity): must sum to zero globally; NOT multiplied by pow_beta

### Alpha Batching

Powers of a single challenge `alpha` separate subrelations. During batching, each subrelation accumulator is scaled by its alpha power, extended to full degree, then combined with the appropriate pow factor (or without, for linearly dependent subrelations).

## Gate Separator Polynomial (pow_beta)

```
pow_beta(X_0,...,X_{d-1}) = prod_{k=0}^{d-1} (1 - X_k + X_k * beta_k)
```

Precomputed on the full hypercube via parallel recurrence. Each round contributes one linear factor `(1-X_i + X_i*beta_i)`. A partial evaluation result accumulates across rounds. When betas is empty (multilinear batching), degenerates to constant 1.

## ZK Sumcheck

Three mechanisms provide zero-knowledge:

### 1. Libra Masking
Adds a structured random multivariate `G(X) = a_0 + g_0(X_0) + ... + g_{d-1}(X_{d-1})` scaled by a Fiat-Shamir challenge. Each round's univariate gets a Libra correction. The concatenated Libra univariates are committed and their evaluation is proved via SmallSubgroupIPA.

### 2. Row Disabling + Masking Tail
Last `NUM_MASKED_ROWS=3` positions (n-3, n-2, n-1) contain random masking values. The row disabling
polynomial `(1-L)` vanishes at the last 4 rows, so the relation sum is unaffected. This adds +1 to
the round univariate degree for ZK flavors.

**Masking Tail Optimization**: Witness polynomials are allocated to `trace_active_range_size()` (shorter
than `dyadic_size`) to save memory. Masking values are NOT written into the polynomials — they are
stored separately in `MaskingTailData` (see `sumcheck/masking_tail_data.hpp`), which uses the
**AllEntities pattern**: `AllEntities<bool> is_masked`, `AllEntities<Polynomial> tails` (small 3-element
tail polys with full virtual_size), and `AllEntities<std::array<FF, 2>> folded` (folded values for
sumcheck rounds). This enables zip-iteration with `extended_edges` in `compute_disabled_contribution`
instead of index-based lookups. The main sumcheck loop **excludes** disabled edge pairs via
`excluded_tail_size`; `compute_disabled_contribution` handles them separately using folded masking
values, multiplied by `(1-L)`, and **added** to the active contribution.

**Critical `excluded_tail_size` invariant**: Must be non-zero ONLY when `Flavor::HasZK && UseRowDisablingPolynomial<Flavor>`:
```cpp
size_t excluded_tail_size = (Flavor::HasZK && UseRowDisablingPolynomial<Flavor>) ? 4 : 0;
```
If set incorrectly for flavors that don't call `compute_disabled_contribution` (e.g., Translator,
MultilinearBatching), edge pairs are silently dropped, causing sumcheck round failures. The post-round-0
update `excluded_tail_size = 2` must also be guarded by `UseRowDisablingPolynomial<Flavor>`.

`compute_effective_round_size` behavior:
- ZK + row disabling: `min(round_size - excluded_tail_size, witness_end_index)`
- ZK without row disabling (Translator): `round_size` (no exclusion, full iteration)
- Non-ZK: `min(round_size, witness_end_index)`

Masking tail fold timing:
- Round 0: fold after `partially_evaluate` (no PE access needed)
- Rounds 1+: fold **before** `partially_evaluate_in_place` (rounds 2+ read PE neighbors)

### 3. Witness Masking in PCS
`MaskingTailData::tails` stores small `Polynomial` objects (3 coefficients at positions {n-3, n-2, n-1},
full virtual_size). Commitments are adjusted as `C' = C_short + commit(tail_poly)` at `add_to_batch`
time — callers pass `&tails.field_name` directly or use `zip_view` over parallel getters (e.g.,
`zip_view(polys.get_wires(), tails.get_wires(), labels.get_wires())`). Non-masked tails are empty
and skipped automatically. In the PCS, tail polynomials are batched alongside base polynomials via
`add_tails_to_batcher` (Ultra Honk, Batched Translator). For ECCVM translation polys (which need
univariate evaluation at full size), tails are merged via `extended += tail` using named fields.
A Gemini masking polynomial ensures PCS opening proofs remain zero-knowledge.

### Batched Honk Translator Integration

The batched translator combines MegaZK and Translator into a joint sumcheck/PCS. Key masking tail
integration points in `batched_honk_translator_prover.cpp`:

1. **Sumcheck `do_round`**: MegaZK uses `+= compute_disabled_contribution(... rdp, masking_tail)`.
   Translator has no disabled contribution.
2. **`fold_masking_values`**: Called per MegaZK round using MegaZK's `round_size` and PE.
3. **`excluded_tail_size = 2`**: Set after round 0 for `mega_zk_round` only.
4. **Claimed eval corrections**: Applied to `mega_zk_claimed_evals` using first `mega_zk_log_n`
   challenges. Must also write corrected values back into `mega_zk_partial[0]` so that
   `compute_virtual_contribution` in virtual rounds uses them.
5. **PCS**: `add_tails_to_batcher` on the joint batcher. Tails at MegaZK positions within
   the larger joint batcher.

## Virtual Rounds and Padding

For constant proof size (recursive verification):
- **Real rounds** (0 to `multivariate_d - 1`): standard sumcheck
- **Virtual/padding rounds** (`multivariate_d` to `virtual_log_n - 1`): polynomials treated as zero-extended

A **padding indicator array** `[1,1,...,1,0,0,...,0]` tells the verifier which rounds are real vs padding. In recursive verification, this is computed in-circuit from a constrained `log_circuit_size` for constant gate count.

## Transcript / Fiat-Shamir Protocol

Prover writes round univariates (or commitments + evals for Grumpkin), final multilinear evaluations, and ZK-related data (Libra sum, evaluation). Challenges drawn: gate challenges, alpha, round challenges `u_i`, and Libra challenge. Translator sends minicircuit evaluations mid-sumcheck after the relevant round.

## Performance Optimizations

- **Row skipping**: Identifies contiguous blocks of non-zero rows; threads iterate only over non-zero blocks
- **AVM chunking**: Splits trace into chunks distributed among threads
- **Effective round size**: Avoids iterating trailing zeros by finding the actual end of witness polynomials
- **Short monomials**: Produces degree-1 univariates during edge extension, deferring full-degree extension to batching
- **Subrelation skipping**: Relations can define a `skip()` method to avoid accumulation when selectors are zero

## Soundness & Completeness Principles

These principles are distilled from historical bugs. They represent recurring vulnerability patterns in sumcheck and its surrounding infrastructure.

### Recursive Verification: Constraints vs Native Checks

In recursive (circuit-based) verifiers, the prover controls all witness values. Any check that doesn't produce a circuit constraint is useless for soundness.

- **Use `.assert_equal()` for all critical comparisons**, not native `==`. Native equality in a circuit builder compares witness values but creates no constraint — a malicious prover can satisfy it trivially.
- **Never use unconstrained witnesses for control flow** (round counts, padding indicators, circuit size). A malicious prover can set them to anything. Always range-constrain and assert consistency with public inputs.
- **Values that vary across proof instances must be witnesses, not constants.** If circuit size or log circuit size is baked in as a constant, the circuit structure changes when those values differ, breaking verification key consistency.

### Fiat-Shamir Transcript Integrity

The Fiat-Shamir transcript is the backbone of non-interactive soundness. Any inconsistency between what the prover hashes and what the verifier hashes breaks the proof system.

- **Every computed value that affects subsequent verification must be absorbed into the transcript.** When optimizing (e.g., batching MSMs, computing derived commitments), ensure the results are hashed. If a value isn't in the transcript, the prover can spoof it.
- **Challenges shared between sub-protocols must be derived from the transcript by both sides**, never sent by the prover. If a challenge appears in two verifiers (e.g., ECCVM and Translator), pass it from one verifier to the other as a class member.
- **Keep hash absorption and proof serialization concerns separate.** Absorbing data into the hash state for Fiat-Shamir is different from appending data to the proof stream. Mixing up their position counters produces wrong challenges.

### Accumulator and State Management

- **Zero accumulators before reuse.** When the same accumulator type is used for multiple purposes within a round (e.g., main relation accumulation then disabled contribution), stale data from the previous use corrupts the result.
- **Assignment vs accumulation matters.** When initializing a running sum (e.g., the first round's target sum), use `=` not `+=`. Accumulating on top of an uninitialized or stale value is a common source of bugs.

### Relation Constraints and Boundary Rows

- **Boundary constraints must not be gated by masking polynomials.** Constraints like "accumulator starts at zero" or "accumulator equals result at the end" must be unconditionally enforced. Masking is for hiding witness values, not for disabling constraint enforcement.
- **Selectors that are zero at row 0 leave initial values unconstrained.** If a "transition" selector activates only on non-first rows, the first row's values are effectively free. Add explicit initial-row constraints (e.g., via a Lagrange-first selector).
- **Multiple state variables representing the same logical state must be constrained consistently.** If coordinates are forced to (0,0), the corresponding "empty" flag must also be constrained. Inconsistencies between redundant state variables create exploitable gaps.

### PCS and Subsystem Refactoring

- **When replacing a PCS scheme, audit all implicit guarantees the old scheme provided.** Zeromorph provided degree checks that enforced polynomials are zero outside their domain. When it was replaced, that enforcement disappeared silently. Explicit relation constraints must replace any lost implicit guarantees (degree bounds, zero-outside-domain, etc.).

### excluded_tail_size and Flavor Guards

- **`excluded_tail_size` must match whether `compute_disabled_contribution` is called.** If edges are
  excluded from the main loop but no disabled contribution adds them back, they're silently lost.
  This breaks sumcheck at round 1+ (round 0 is masked by `(1-L)=0`).
- **Guard `excluded_tail_size` on BOTH `HasZK` AND `UseRowDisablingPolynomial`.** Non-ZK flavors
  (MultilinearBatching, MegaFlavor) and ZK flavors without row disabling (Translator) must have
  `excluded_tail_size = 0`. Getting this wrong hangs or corrupts the sumcheck for those flavors.
- **When writing back corrected evaluations for virtual rounds** (batched translator), ensure the
  corrections are applied to the PE multivariates (not just the claimed evals struct), so
  `compute_virtual_contribution` reads the right values.
- **MaskingTailData uses AllEntities pattern** — `is_masked`, `tails`, `folded` are all
  `AllEntities<T>` structs, enabling direct iteration via `get_masked()`/`get_shifted()` without
  pointer matching or index lookups. Registration, folding, eval corrections, and PCS batching
  all use these parallel getters. Shifted tails are derived at registration time
  (shift[k] = unshifted[k+1]). Callers access tails by named field (e.g., `tails.w_l`) or
  `zip_view` over parallel getters. Only `compute_disabled_contribution` in `sumcheck_round.hpp`
  uses `is_masked.get_all()` with index-based access (to correlate with `extended_edges`).

### Merge and Refactoring Safety

- **Performance optimizations can be silently disabled by merges.** Row skipping and relation skipping have both been broken by merge conflicts that compiled cleanly and passed correctness tests. The only detection is performance benchmarking.
- **When modifying relation degrees**, check `MAX_PARTIAL_RELATION_LENGTH`, `BATCHED_RELATION_PARTIAL_LENGTH`, `NUM_SUBRELATIONS`, and downstream proof size constants.
- **Prover and verifier transcript operations must stay in lockstep.** Any change to what the prover writes must be mirrored in the verifier, and vice versa.

## Testing Sumcheck Changes

```bash
cd barretenberg/cpp && cmake --preset default && cd build

ninja sumcheck_tests && ./bin/sumcheck_tests         # Unit tests
ninja ultra_honk_tests && ./bin/ultra_honk_tests      # Integration with real circuits
ninja eccvm_tests && ./bin/eccvm_tests                 # Committed sumcheck (Grumpkin)
ninja hypernova_tests && ./bin/hypernova_tests         # HyperNova folding
ninja chonk_tests && ./bin/chonk_tests                 # Batched prover/verifier with ZK
```

## Audit Status

Internal audit complete (Khashayar). External audits not yet started. Audit scope document at `barretenberg/cpp/scripts/audit/audit_scopes/sumcheck_pcs_chonk_verifier_audit_scope.md`.
