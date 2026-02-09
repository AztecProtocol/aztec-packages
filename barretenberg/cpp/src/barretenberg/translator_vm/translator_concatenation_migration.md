# Translator: Concatenated Polynomial Commitments & Computable Precomputed Selectors

## Overview

Two optimizations reduce the Translator proof size and verifier cost:

1. **Concatenation**: Replace 77 individual minicircuit wire commitments with 5 concatenated
   polynomial commitments. The prover still evaluates individual wires in Sumcheck; the verifier
   reconstructs concatenated evaluations from wire evaluations using Lagrange decomposition.

2. **Computable precomputed selectors**: 12 of 13 precomputed selectors are structured multilinear
   polynomials whose evaluations at the sumcheck challenge can be computed in O(d) field ops. The
   prover skips sending these 12 evaluations; the verifier computes them locally.

**Net savings**:
- 72 fewer group element commitments (83 → 11)
- 12 fewer FR evaluations in proof
- 12 fewer MSMs in verifier PCS

---

## Part 1: Concatenation

### Previous Commitment Structure

| Category | Count | Size | Shifted? | Concatenatable? |
|---|---|---|---|---|
| Range constraint wires | 64 | MINI | Yes | Yes |
| Non-range main wires | 13 | MINI | Yes | Yes |
| Ordered range constraints | 5 | N (full) | Yes | No |
| z_perm | 1 | N (full) | Yes | No |
| **Total** | **83** | | | |

- `MINI = MINI_CIRCUIT_SIZE`, `N = 16 * MINI` (full circuit domain).
- 4 **interleaved** polynomials constructed post-hoc (not committed); their openings were
  verified via Shplemini's `InterleavedBatch` using the 64 range constraint commitments.
- The interleaving mapped `interleaved[k*16 + j] = source_wire_j[k]`.

### Why Interleaving Cannot Replace Individual Commitments

**Interleaving cannot be used in the reverse direction** (from grouped commitment to individual
evaluations). The fundamental issue is a structural mismatch between how source wires and
interleaved polynomials encode row information.

For N-sized zero-padded source wires, non-zero entries lie in `[0, MINI)`, so the upper bits
(`d-4` through `d-1`) are always 0:

```
source_j(u) = Π_{i=d-4}^{d-1} (1-u_i) · source_j^mini(u_0, ..., u_{d-5})
```

For the interleaved polynomial (lane bits `j` as LSB):

```
interleaved(u) = Σ_j L_j(u_0..u_3) · source_j^mini(u_4, ..., u_{d-1})
```

The two appearances of `source_j^mini` are at **different evaluation points**:
- `(u_0, ..., u_{d-5})` in the source wire decomposition
- `(u_4, ..., u_{d-1})` in the interleaved decomposition

These are generally unequal. The verifier cannot reconstruct `interleaved(u)` from
the Sumcheck evaluations `source_j(u)`.

### Concatenation: Lane Bits as MSB

Replace 77 individual minicircuit wire commitments with 5 **concatenated** polynomials:

```
concatenated_i[j * MINI + k] = group_i_wire_j[k]
```

Lane bits are MSB (positions `d-4` through `d-1`), row bits are LSB (positions `0` through
`d-5`). This makes the decomposition compatible:

```
concat_i(u) = Σ_j L_j(u_{d-4}..u_{d-1}) · source_j^mini(u_0..u_{d-5})
            = [1/padding] · Σ_j L_j(u_top) · source_j(u)
```

where `padding = Π_{i=d-4}^{d-1} (1-u_i)`. Both use `source_j^mini(u_0..u_{d-5})` — the
**same evaluation point**. The verifier can reconstruct `concat_i(u)` from individual
`source_j(u)` evaluations.

### Concatenation Groups

| Group | Contents | Batch size |
|---|---|---|
| 0 | Range constraint wires: `p_x_low_0..tail`, `p_x_high_0..tail`, `p_y_low_0..3` | 16 |
| 1 | Range constraint wires: `p_y_low_4..tail`, `p_y_high_0..tail`, `z_low_0..tail`, `z_high_0..1` | 16 |
| 2 | Range constraint wires: `z_high_2..tail`, `acc_low_0..tail`, `acc_high_0..tail` | 16 |
| 3 | Range constraint wires: `quot_low_0..tail`, `quot_high_0..tail`, `rel_wide_0..3` | 16 |
| 4 | Non-range main wires (13) + 3 null padding (zero) | 16 |

**File:** `translator_flavor.hpp` — `WitnessEntities::get_groups_to_be_concatenated()`

### Pure Concatenation Requirement

The concatenated polynomial **must** be a faithful concatenation of the source wires.
Sumcheck evaluates individual source wire polynomials, and the PCS proves these
evaluations by opening the concatenated commitment. Chunk evaluations derived from the
concatenated commitment must exactly match the source wire evaluations. Any modification
to the concatenated polynomial would break this chain.

**File:** `translator_proving_key.cpp` — `compute_concatenated_polynomials()`

### Zero 0th Coefficient for Shiftable Chunks

**All minicircuit wires in concatenated groups satisfy `f_j[0] = 0`.**

This is required for soundness of the **shifted evaluation decomposition** from the
concatenated commitment. The global shift of a concatenated polynomial has cross-boundary
terms:

```
concat_shift[j*MINI + k] = concat[j*MINI + k + 1]
  = f_j[k+1]         for k < MINI-1
  = f_{j+1}[0]       for k = MINI-1   ← cross-boundary term
```

If `f_{j+1}[0] = 0` for all `j`, the cross-boundary terms vanish and the shifted
concatenated polynomial decomposes cleanly:

```
concat_shift(u) = [1/padding] · Σ_j L_j(u_top) · f_j_shift(u)
```

enabling the verifier to reconstruct `concat_shift(u)` from individual `f_j_shift(u)`
evaluations.

The honest prover constructs all minicircuit wires with `start_index = 1`, so `f_j[0] = 0`
holds by construction. The existing zero constraint (`TranslatorZeroConstraintsRelation`)
enforces `wire = 0` outside the active minicircuit region `[RESULT_ROW, MINI - NUM_MASKED)`,
which covers row 0. Note that both `lagrange_even_in_minicircuit` and
`lagrange_odd_in_minicircuit` are zero at row 0, so the zero constraint is active there.

---

## What Does NOT Change (Relations)

### Decomposition Relation
- References individual range constraint wires (block 0 of the domain).
- Uses `lagrange_even_in_minicircuit`. **No change.**

### Non-Native Field Relation
- Uses limb wires with shifts. Uses `lagrange_even_in_minicircuit`. **No change.**

### Accumulator Transfer Relation
- Uses `lagrange_odd_in_minicircuit`, `lagrange_result_row`, `lagrange_last_in_minicircuit`.
- All in block 0. **No change.**

### Zero Constraint Relation
- Enforces range constraint wires = 0 outside minicircuit+masking region.
- Operates on individual wires (block 0). **No change.**

### Opcode Constraint
- Uses `lagrange_even_in_minicircuit`, `lagrange_mini_masking`. **No change.**

---

## What Changed

### 1. Masking Layout: Scattered vs. Contiguous

With concatenation, masking rows in the **concatenated** polynomials are scattered: the last
`NUM_MASKED_ROWS_END` rows of each of the 16 blocks, i.e., positions
`{j * MINI + k : j ∈ [0,16), k ∈ [MINI - NUM_MASKED_ROWS_END, MINI)}`.

In the **ordered** polynomials, masking values are placed **contiguously at the end**:
the last `MAX_RANDOM_VALUES_PER_ORDERED` positions (= `16 * NUM_MASKED_ROWS_END = 64`).

This asymmetry requires **two separate masking selectors**:

| Selector | Where active | Used by |
|---|---|---|
| `lagrange_masking` | Scattered (end of each of 16 blocks) | Permutation numerator (concatenated polys) |
| `lagrange_ordered_masking` | Contiguous (last 64 rows) | Permutation denominator + extra numerator (ordered polys) |

**File:** `translator_proving_key.cpp` — `compute_lagrange_polynomials()`

### 2. Permutation Relation: Dual Masking Selectors

The permutation numerator uses `lagrange_masking * β` for the 4 concatenated range constraint
factors and `lagrange_ordered_masking * β` for the extra numerator factor. The denominator
uses `lagrange_ordered_masking * β` for all 5 ordered factors.

```
P(X) = Π_{i=0:3} (concat_range_i(X) + lagrange_masking·β + γ)
      · (extra_numerator(X) + lagrange_ordered_masking·β + γ)

Q(X) = Π_{i=0:4} (ordered_i(X) + lagrange_ordered_masking·β + γ)
```

The `lagrange_masking * β` terms ensure masking positions contribute unique values to the grand
product, preventing information leakage. The multiset check is order-independent: the non-masking
multisets match between numerator and denominator. Masking positions are excluded from the check
via the beta-separation term.

**Files:** `translator_permutation_relation.hpp`, `translator_permutation_relation_impl.hpp`

### 3. Delta Range Constraint: Ordered Masking Disable

The delta range constraint checks `ordered[i+1] - ordered[i] ∈ {0,1,2,3}` at each row.
With contiguous masking at the end of ordered polynomials, the constraint must be disabled
at masking positions AND at the `lagrange_real_last` row (where we enforce the maximum value).

The disable condition uses a linear form with disjoint-support selectors:

```cpp
not_last_or_masking = lagrange_real_last + lagrange_ordered_masking - 1
// = 0 (disabled) when either is 1 (disjoint support, so at most one is 1)
// = -1 (enabled) otherwise
```

`lagrange_real_last` marks position `circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1`, which
is the last non-masking row where we enforce `ordered_value = 2^14 - 1`.

**Files:** `translator_delta_range_constraint_relation.hpp`, `..._impl.hpp`

### 4. `lagrange_masking_adjacent`: Scattered Masking + Adjacent Rows

`lagrange_masking_adjacent` extends `lagrange_masking` by also being 1 at the row immediately
preceding each block's masking region. For each block `j`:

```
Active at: {j*MINI + (MINI - NUM_MASKED - 1)} ∪ {j*MINI + k : k ∈ [MINI - NUM_MASKED, MINI)}
```

This is a precomputed polynomial included in the VK. It is available for potential future use
in constraints that need to disable checks at or near scattered masking boundaries.

### 5. Ordered Polynomial Construction

**File:** `translator_proving_key.cpp` — `compute_translator_range_constraint_ordered_polynomials()`

Ordered polynomials contain sorted values from the concatenated range constraint wires plus
"step" padding values. The structure:

- Positions `[1, circuit_size - MAX_RANDOM_VALUES_PER_ORDERED)`: sorted values (non-descending)
- Position `circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1`: maximum value `2^14 - 1`
  (enforced by `lagrange_real_last`)
- Positions `[circuit_size - MAX_RANDOM_VALUES_PER_ORDERED, circuit_size)`: random masking values
- Position 0: virtual zero (start_index = 1)

Values from each concatenation group are packed tightly (excluding masking rows), sorted, then
placed into ordered polynomials. Overflow from the first 4 groups goes into `ordered_range_constraints_4`.

### 6. Random Value Distribution

**File:** `translator_proving_key.cpp` — `split_concatenated_random_coefficients_to_ordered()`

Random masking values are extracted from the scattered positions of the first 4 concatenated
range constraint polynomials (the ones in the permutation numerator) and distributed to the 5
ordered polynomials at the **contiguous** end positions. Each ordered polynomial gets
approximately `total_random / 5` values.

### 7. Flavor: Entity Classes and Commitment Structure

**File:** `translator_flavor.hpp`

- `ConcatenatedPolynomials<DataType>`: 5 concatenated polys (4 range + 1 non-range)
- `WitnessEntities` includes `ConcatenatedPolynomials` and provides:
  - `get_non_opqueue_wires_and_ordered_range_constraints()`: returns 5 concatenated + 5 ordered = 10
    (these are committed to by the prover)
  - `get_unshifted_without_concatenated()`: op(1) + ordered(5) + z_perm(1) = 7 witness entries
    for standard PCS batching
  - `get_to_be_shifted()`: op_queue(3) + ordered(5) + z_perm(1) = 9 shifted-by-1 entries for PCS
  - `get_groups_to_be_concatenated()`: 5 groups of 16 wires each
- `ShiftedEntities` provides:
  - `get_pcs_shifted()`: op(3) + ordered(5) + z_perm(1) = 9 shifted evaluations for PCS
  - `get_groups_to_be_concatenated_shifted()`: 5 groups of 16 shifted wires each
- `AllEntities::get_unshifted_without_concatenated()`: masking(1) + ordered_extra(1) + witness(7) = 9
  entries for PCS (12 computable precomputed excluded)

### 8. Prover: Commitment + PCS Rounds

**File:** `translator_prover.cpp`

- `execute_wire_and_sorted_constraints_commitments_round()`: commits to 10 polynomials
  (5 concatenated + 5 ordered) instead of 82 (77 wires + 5 ordered).
- `execute_pcs_rounds()`: uses `PolynomialBatcher` with:
  - Unshifted: `get_unshifted_without_concatenated()` (9) + concatenated (5) = 14
  - Shifted: `get_to_be_shifted()` (9) + concatenated (5) = 14
  - Concatenated polys appear in both unshifted and shifted batches (they need both claims)

### 9. Verifier: Concatenation Consistency Check + PCS

**File:** `translator_verifier.cpp`

The verifier reconstructs concatenated evaluations (both unshifted and shifted) from individual
wire evaluations using Lagrange decomposition over the top 4 sumcheck challenges:

```
concat_i(u) = [1/L_0(u_top)] · Σ_j L_j(u_top) · wire_j(u)
```

where `L_0(u_top) = Π_{i=0}^3 (1 - u_top[i])` and `L_j` is the Lagrange basis over 4 bits.

The shifted version uses the same formula with shifted wire evaluations (valid because `f_j[0] = 0`).

Claims are batched without `InterleavedBatch`:
- Unshifted: standard unshifted (9) + concatenated (5) = 14
- Shifted: standard shifted (9) + concatenated shifts (5) = 14

---

## Part 2: Computable Precomputed Selectors

### Precomputed Entities (13 total)

| # | Selector | Computable? | Structure |
|---|---|---|---|
| 0 | `ordered_extra_range_constraints_numerator` | No | Non-structured data |
| 1 | `lagrange_first` | Yes | Single point: row 0 |
| 2 | `lagrange_last` | Yes | Single point: row N-1 |
| 3 | `lagrange_odd_in_minicircuit` | Yes | Alternating rows in block 0 |
| 4 | `lagrange_even_in_minicircuit` | Yes | Alternating rows in block 0 |
| 5 | `lagrange_result_row` | Yes | Single point: row RESULT_ROW |
| 6 | `lagrange_last_in_minicircuit` | Yes | Single point |
| 7 | `lagrange_masking` | Yes | Subcube: bits m..M-1 = 1 |
| 8 | `lagrange_mini_masking` | Yes | Two disjoint blocks in block 0 |
| 9 | `lagrange_real_last` | Yes | Single point: row N-MAX_RANDOM-1 |
| 10 | `lagrange_masking_adjacent` | Yes | Near-subcube: masking ∪ adjacent rows |
| 11 | `lagrange_ordered_masking` | Yes | Subcube: bits R..D-1 = 1 |

All 11 computable selectors are structured multilinear polynomials whose support forms subcubes
or small unions of subcubes. Their evaluations at the sumcheck challenge can be computed in O(d)
field operations.

**File:** `translator_selectors.hpp` — `TranslatorSelectorEvaluations::compute()`

### Soundness Argument

Precomputed polynomials are deterministic (fixed by the VK). Their evaluations at any point are
publicly computable. PCS verification of precomputed commitments is redundant — Sumcheck's
relation check already ensures consistency between claimed evaluations and the actual polynomial
identities. Any forgery of witness evaluations would still be caught by the witness PCS.

### Implementation

**Flavor constants** (`translator_flavor.hpp`):
```cpp
static constexpr size_t NUM_COMPUTABLE_PRECOMPUTED = 11;
static constexpr size_t COMPUTABLE_PRECOMPUTED_OFFSET = NUM_MASKING_POLYNOMIALS + 1; // = 2
static constexpr size_t NUM_SENT_EVALUATIONS = NUM_ALL_ENTITIES - NUM_COMPUTABLE_PRECOMPUTED; // = 180
```

**Prover** (`sumcheck.hpp`): sends `NUM_SENT_EVALUATIONS` instead of `NUM_ALL_ENTITIES`:
```cpp
if constexpr (requires { Flavor::NUM_COMPUTABLE_PRECOMPUTED; }) {
    auto filtered = Flavor::get_all_without_computable_precomputed(multivariate_evaluations);
    transcript->send_to_verifier("Sumcheck:evaluations", filtered);
}
```

**Verifier** (`sumcheck.hpp`): receives fewer evals and computes the rest locally:
```cpp
if constexpr (requires { Flavor::NUM_COMPUTABLE_PRECOMPUTED; }) {
    auto transcript_evals = transcript->template receive_from_prover<
        std::array<FF, Flavor::NUM_SENT_EVALUATIONS>>("Sumcheck:evaluations");
    Flavor::set_all_without_computable_precomputed(purported_evaluations, transcript_evals);
    Flavor::compute_computable_precomputed(purported_evaluations, multivariate_challenge);
}
```

**PCS**: `get_unshifted_without_concatenated()` at the `AllEntities` level returns 9 entries
(masking + ordered_extra + witness), excluding all 12 computable precomputed. This means 12
fewer scalar multiplications in the verifier's batch opening check.

---

## Summary of Changes from Interleaving

| Component | Change |
|---|---|
| `lagrange_masking` | Scattered across 16 blocks (end of each block) |
| New: `lagrange_masking_adjacent` | Precomputed = masking ∪ row-before-masking (scattered) |
| New: `lagrange_ordered_masking` | Precomputed = contiguous at end (for ordered polys) |
| `lagrange_real_last` | Position `circuit_size - MAX_RANDOM_VALUES_PER_ORDERED - 1` |
| Permutation relation | Dual masking selectors (scattered for numerator, contiguous for denominator) |
| Delta range constraint | Uses `lagrange_real_last + lagrange_ordered_masking - 1` (linear form) |
| Ordered polynomial construction | Contiguous masking at end; sorted values packed before |
| `compute_interleaved_polynomials()` → `compute_concatenated_polynomials()` | MSB-lane concatenation |
| `split_interleaved_..._to_ordered()` → `split_concatenated_..._to_ordered()` | Extract from scattered, place contiguous |
| Flavor entity classes | `ConcatenatedPolynomials`, null-padded group 4, dual getters |
| Prover commitment round | 10 commitments (5 concat + 5 ordered) |
| Prover PCS round | 14 unshifted + 14 shifted (standard + concatenated) |
| Verifier PCS | Lagrange reconstruction of concat evals; no InterleavedBatch |
| Sumcheck (prover) | Sends `NUM_SENT_EVALUATIONS` (12 computable precomputed excluded) |
| Sumcheck (verifier) | Receives fewer evals; computes 12 precomputed locally |
| PCS batching | 12 fewer MSMs (computable precomputed excluded) |

## Commitment Count Summary

| | Before (interleaving) | After (concatenation) |
|---|---|---|
| Range constraint wires | 64 | 0 (in 4 concat groups) |
| Non-range main wires | 13 | 0 (in 1 concat group) |
| Concatenated commitments | 0 | 5 |
| Ordered range constraints | 5 | 5 |
| z_perm | 1 | 1 |
| **Total** | **83** | **11** |

## Entity Count Summary

| | Count | Notes |
|---|---|---|
| `NUM_ALL_ENTITIES` | 192 | Masking(1) + Precomputed(13) + Witness(92) + Shifted(86) |
| `NUM_SENT_EVALUATIONS` | 180 | `NUM_ALL_ENTITIES - NUM_COMPUTABLE_PRECOMPUTED` |
| `NUM_PRECOMPUTED_ENTITIES` | 13 | 1 non-computable + 12 computable |
| Unshifted for PCS | 9 | Masking(1) + ordered_extra(1) + op(1) + ordered(5) + z_perm(1) |
| Shifted for PCS | 9 | op_queue(3) + ordered(5) + z_perm(1) |
| Concatenated (both claims) | 5 | Appear in both unshifted and shifted PCS batches |

## Critical Files

| File | Changes |
|---|---|
| `translator_vm/translator_selectors.hpp` | `TranslatorSelectorEvaluations`: computes 12 selectors + `populate()` |
| `translator_vm/translator_flavor.hpp` | Entity classes, constants, static methods, `PROOF_LENGTH` |
| `translator_vm/translator_proving_key.hpp` | Concatenation/ordering parameters |
| `translator_vm/translator_proving_key.cpp` | Concatenation, ordered polys, Lagrange polys, random distribution |
| `translator_vm/translator_prover.cpp` | Commitment round (10 polys), PCS round (14+14) |
| `translator_vm/translator_verifier.cpp` | Lagrange reconstruction, dual claim batching |
| `stdlib/translator_vm_verifier/translator_recursive_flavor.hpp` | Forwarded constants and methods |
| `sumcheck/sumcheck.hpp` | Prover: filtered eval send; Verifier: filtered receive + compute |
| `relations/translator_vm/translator_permutation_relation*.hpp` | Dual masking selectors |
| `relations/translator_vm/translator_delta_range_constraint_relation*.hpp` | `lagrange_real_last + lagrange_ordered_masking` |
