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
- `Sumcheck.md` — Detailed mathematical documentation

### Supporting:

- `polynomials/gate_separator.hpp` — pow_beta polynomial
- `polynomials/row_disabling_polynomial.hpp` — ZK row masking
- `flavor/partially_evaluated_multivariates.hpp` — Book-keeping table for partial evaluation
- `flavor/flavor_concepts.hpp` — Flavor dispatch concepts
- `relations/` — Relation types, utilities, parameters, nested containers

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

### 2. Row Disabling + In-Place Masking (Top-of-Trace)
The first `NUM_DISABLED_ROWS_IN_SUMCHECK=4` rows of the trace are reserved. For ZK flavors,
`NUM_MASKED_ROWS=3` random values are written directly into witness polynomials at rows 1, 2, 3
(row 0 is the zero row for shifts). The row disabling polynomial `(1-L)` vanishes at rows 0-3,
so the relation sum is unaffected. This adds +1 to the round univariate degree for ZK flavors.

The layout is **uniform across ZK and non-ZK** — non-ZK flavors have zeros in these rows, so
relations are trivially satisfied there without row disabling.

**`excluded_head_size` invariant**: Non-zero only when the flavor needs the offset-area path —
currently this is `Flavor::HasZK`:
```cpp
size_t excluded_head_size = Flavor::HasZK ? Flavor::TRACE_OFFSET : 0;
```
The main sumcheck loop skips the first `excluded_head_size` edge pairs; `compute_offset_area_contribution`
handles them separately, applying per-relation row-disabling factors (`(1-L)` for main-domain rels,
`L` for offset-only rels — see below), and adds the result to the main-loop contribution. Non-ZK
flavors keep `excluded_head_size = 0` in round 0 (head rows are all zeros, processed uniformly by
the main loop); after round 0 it flips to 2 for the partially-evaluated head-edge pair (harmless
for non-ZK since those rows remain zero).

### 3. Witness Masking in PCS
Masking values are written directly into the polynomials (in-place), so `commit(poly)` produces the
correct masked commitment directly. A Gemini masking polynomial ensures PCS opening proofs remain
zero-knowledge.

### Offset-Only Relations (boundary constraints on rows 0..3)

A relation tagged `static constexpr bool IS_OFFSET_ONLY = true` (detected by the
`IsOffsetOnlyRelation` concept) has its round-univariate contribution scaled by `L(X)`
instead of `(1 - L)(X)`, so it fires only on the offset area (rows 0..`TRACE_OFFSET-1`).
The sumcheck dispatch (`extend_and_batch_univariates` and
`scale_and_batch_elements`) picks the factor per relation at compile time.

Used by `MegaEccOpBoundaryRelation` (in `ecc_op_queue_relation.hpp`) to enforce
`ecc_op_wire_j = 0` on rows 0..3 for MegaZK, making the boundary verifier-visible.
The `has_any_offset_only_relation_v<Flavor>` trait checks whether any relation in the
flavor's `Relations` tuple opts in. Not compatible with ZK flavors whose masked rows
overlap with the constrained entities.

### Batched Honk Translator Integration

The batched translator combines MegaZK and Translator into a joint sumcheck/PCS.
MegaZK uses `+= compute_offset_area_contribution(... rdp)` for the head rows.
Translator has no offset-area contribution (it uses tail masking independently).
After round 0, `excluded_head_size = 2` for the MegaZK round (the offset area collapses to 1 edge pair).

## Virtual Rounds and Padding

For constant proof size (recursive verification):
- **Real rounds** (0 to `multivariate_d - 1`): standard sumcheck
- **Virtual/padding rounds** (`multivariate_d` to `virtual_log_n - 1`): polynomials treated as zero-extended

With top-of-trace masking, the row-disabling polynomial is circuit-size independent, so all sumcheck
rounds are processed uniformly by the verifier — no padding indicator needed.

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

### excluded_head_size and Flavor Guards

- **`excluded_head_size` must match whether `compute_offset_area_contribution` is called.** If edges are
  excluded from the main loop but no offset-area contribution adds them back, they're silently lost.
- **Non-ZK flavors use `excluded_head_size = 0` in round 0** (head rows hold zeros, processed by the
  main loop). The `compute_offset_area_contribution` call is still issued and returns zero — a no-op.
  Flipping `excluded_head_size` to 2 after round 0 is safe regardless of flavor.

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
