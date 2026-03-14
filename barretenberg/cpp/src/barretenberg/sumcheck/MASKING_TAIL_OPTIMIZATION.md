# Masking Tail Optimization: Short Witness Polynomials in ZK Sumcheck

## Problem

Witness polynomials are allocated to `trace_active_range` (shorter than `dyadic_size`) to save memory.
The last `NUM_MASKED_ROWS` positions (n-3, n-2, n-1) contain zeros instead of actual masking values.
Masking values are stored separately in `MaskingTailData`.

The 4 disabled rows (n-4, n-3, n-2, n-1) are zeroed out by the row-disabling polynomial `(1-L)`.
Currently, the main sumcheck loop iterates over ALL edges including disabled ones, and
`compute_disabled_contribution` subtracts `L * H_disabled`. With short polys, both use zeros
consistently, so `S' = S_active + (1-L)*H_zeros`. But `(1-L)*H_zeros != (1-L)*H_masks` at
non-boolean evaluation points (X=2,3,...,D+1), causing incorrect round univariates from round 1
onward.

The core issue: `extend_edges` extends the linear polynomial `(poly[even], poly[odd])` to degree D.
With zeros instead of masking values, the extension differs, and after multiplication by `(1-L)`,
the higher-degree coefficients are wrong.

Additionally, PE multivariates are sized by `end_index/2`. With short witness polys, they don't
extend to disabled positions, so the main loop can't safely iterate over them.

## Mathematical Background

The modified relation is `sum_H (1-L) * H = 0` where `L = L_{n-1} + L_{n-2} + L_{n-3} + L_{n-4}`.

Current round univariate: `S'_i(X) = S_{H,i}(X) - L^{(i)}(X) * H_disabled^{(i)}(X)`

where `S_{H,i}` is the sum over ALL edge pairs, and `H_disabled` is the relation at disabled edges.

Equivalently: `S'_i(X) = S_{active,i}(X) + (1 - L^{(i)}(X)) * H_disabled^{(i)}(X)`

The `(1-L)` factor per round:
- Round 0: `L^{(0)}(X) = 1` (constant) => `(1-L) = 0` => disabled contribution is 0
- Round 1: `L^{(1)}(X) = X` => `(1-L) = (1-X)`
- Round i>=2: `L^{(i)}(X) = u_2*...*u_{i-1} * X` => `(1-L) = 1 - u_2*...*u_{i-1}*X`

## Approach

### 1. Main loop: active edges only

`compute_effective_round_size` for ZK with `use_masking_tail = true` excludes disabled rows by
finding `max_end_index` across witness polynomials (via `get_witness()`) and capping at
`round_size - 2`. In round 0, witness `end_index <= n-4` naturally excludes both disabled edge
pairs; in rounds 1+, the cap at `round_size - 2` excludes the single remaining disabled edge pair.

This computes `S_active(X)`.

### 2. Disabled contribution: use real masking values

`compute_disabled_contribution_with_masking` constructs "virtual" extended edges at disabled
positions using:
- **Precomputed polys** (selectors, etc.): read from full_polynomials/PE as normal (they're full-size)
- **Masked witness polys**: use folded masking values from MaskingTailData

The disabled contribution is then `(1-L) * H_disabled_with_masks` and is **added** to `S_active`.

### 3. Folding masking values across rounds

MaskingTailData tracks folded masking values per entry via the `FoldedValues` struct (stores up to
2 values and a count).

**Initial state** (4 disabled positions per masked poly):
```
pos n-4: 0
pos n-3: mask[0]
pos n-2: mask[1]
pos n-1: mask[2]
```

**After round 0** (fold pairs with u_0 => 2 values per entry, count=2):
```
folded[0] = u_0 * mask[0]                              // from (n-4, n-3)
folded[1] = mask[1] + u_0 * (mask[2] - mask[1])        // from (n-2, n-1)
```

**After round 1** (fold pair with u_1 => 1 value per entry, count=1):
```
folded[0] = prev[0] + u_1 * (prev[1] - prev[0])
```

**After round i>=2** (fold disabled value with its active PE neighbor):
The disabled position is always the last entry in PE. Its neighbor (the even-indexed partner) is
an active position with correct values in PE. To fold:
```
active_neighbor = PE_all[entry.all_entities_index][round_size - 2]
folded[0] = active_neighbor + u_i * (folded[0] - active_neighbor)
```

Note: After round 2+, the folded value mixes with an active neighbor, so the "disabled" position
is no longer purely a masking tail contribution. But `compute_disabled_contribution_with_masking`
reads this edge pair from PE anyway, so we only need to provide the correct value at the odd
(disabled) position.

#### Fold timing

- **Round 0**: `fold_masking_values` is called **after** `partially_evaluate_first_round`. This is
  safe because round 0 folding only reads from `mask_values` (no PE access needed).
- **Rounds 1+**: `fold_masking_values` is called **before** `partially_evaluate_in_place`. This is
  required because rounds 2+ read active neighbor values from PE, which would be overwritten by
  partial evaluation. Round 1 folding doesn't read PE, but the uniform "before PE" placement keeps
  the code simple.

### 4. Virtual edge construction for disabled contribution

In `compute_disabled_contribution_with_masking`:

```
// Round 0: return zero (early exit, since (1-L) = 0)

for each disabled edge_idx (only round_size-2 for rounds 1+):
    // extend_edges reads from polynomials normally
    extend_edges(extended_edges, polynomials, edge_idx);

    // Override masked witness polys at the disabled positions
    for each masked entry in masking_tail_data:
        size_t poly_idx = entry.all_entities_index;
        auto [folded_val_0, folded_val_1] = get_entry_folded_values(entry);
        if folded_count == 2:  // Round 1: both positions in disabled zone
            override_edge(poly_idx, folded_val_0, folded_val_1);
        else:                  // Rounds 2+: only odd position needs override
            FF actual_even = polynomials.get_all()[poly_idx][edge_idx];
            override_edge(poly_idx, actual_even, folded_val_0);

    // Same for shifted entries (use shifted folded values)

    accumulate_relation_univariates(...);

// Multiply by (1-L) factor: Univariate({1 - L.eval_at_0, 1 - L.eval_at_1}).extend_to<D>()
result *= one_minus_L_extended;
```

### 5. Specific round behavior

**Round 0**: `(1-L) = 0`, so `compute_disabled_contribution_with_masking` returns zero immediately.
Just compute `S_active`.

**Round 1**: Read disabled edge pair at `round_size-2`. `folded_count == 2`, so override both even
and odd positions for masked witness polys with `folded[0]` and `folded[1]`. Multiply result by
`(1-X)`.

**Round i>=2**: Read disabled edge pair at `round_size-2`. `folded_count == 1`. The even position
is active (correct in PE for all polys). Override the odd position for masked witness polys with
`folded[0]`. Multiply result by `(1 - u_2*...*u_{i-1}*X)`.

### 6. Edge detail: which PE positions are "even" vs "odd" at disabled edges

- Round 1: edge_idx = `round_size-2`. Even = PE[round_size-2], Odd = PE[round_size-1].
  Both are in the disabled zone (n/2-2 and n/2-1). Both need masking values for witness polys.
  For precomputed polys, both are within full PE and have correct values.

- Round i>=2: edge_idx = `round_size-2`. Even = PE[round_size-2], Odd = PE[round_size-1].
  Even is the active neighbor (within witness PE end_index). Odd is the disabled position
  (beyond witness PE end_index, reads as 0, needs override with folded mask value).

## Implementation Details

### `sumcheck_round.hpp`
- `use_masking_tail` flag: When true, `compute_effective_round_size` finds `max_end_index` across
  witness polys (via `get_witness()`) and caps at `round_size - 2`. Falls back to `round_size - 2`
  if no `get_witness()` method is available.
- `compute_disabled_contribution_with_masking`: Accepts `MaskingTailData`, overrides masked witness
  poly values in extended edges with folded masking values. Multiplies by `(1-L)` and returns the
  result to be **added** (not subtracted) to the round univariate. Returns zero for round 0.

### `masking_tail_data.hpp`
- `FoldedValues` struct: Stores `std::array<FF, 2> values` and `size_t count` (2 after round 0,
  1 after round 1+). `get_entry_folded_values` returns both values; caller checks `get_folded_count()`
  to determine which are valid.
- `fold_masking_values(FF challenge, size_t round_idx, size_t round_size, const PolynomialCollection* pe)`:
  Folds values per round. Rounds 2+ require `pe` to read active neighbor values.
- Separate `folded` and `shifted_folded` vectors track unshifted and shifted entries independently.
- `inject_into_polynomials`: Writes masking values back into polynomials before PCS opening.
- `apply_claimed_eval_corrections`: Adds Lagrange-basis corrections to claimed evaluations after
  sumcheck, using only the real (non-padding) challenges.

### `sumcheck.hpp`
- In the ZK `prove()` method:
  - Sets `round.use_masking_tail = true` when masking tail is active.
  - Uses `round_univariate += compute_disabled_contribution_with_masking(...)` (masking path) vs
    `round_univariate -= compute_disabled_contribution(...)` (original path).
  - Round 0: `fold_masking_values` called **after** `partially_evaluate_first_round`.
  - Rounds 1+: `fold_masking_values` called **before** `partially_evaluate_in_place` (to read PE
    active neighbor values before they are overwritten).
  - After all rounds, `apply_claimed_eval_corrections` adds masking tail corrections to multivariate
    evaluations using only `multivariate_d` real challenges (excluding virtual/padding challenges).

### PCS tail batching (`gemini.hpp` PolynomialBatcher)

Instead of extending each short witness polynomial to full `dyadic_size` just to write 3 mask values
(the old `inject_into_polynomials` approach), the PolynomialBatcher now supports **tails**: small
polynomials (NUM_MASKED_ROWS values at positions {n-3, n-2, n-1}) that are batched alongside their
corresponding base polynomial using the same rho scalar.

- `add_unshifted_tail(batcher_index, tail_poly)` / `add_shifted_tail(...)`: Register a tail for a
  specific polynomial in the unshifted/shifted batch. Tails are sorted by index before batching.
- In `compute_batched`, if tails are present, the batched accumulators are expanded to `full_batched_size`
  (since tails extend beyond `actual_data_size_`). Each tail is `add_scaled` with the same rho power
  as its corresponding base polynomial.
- `MaskingTailData::add_tails_to_batcher(prover_polys, batcher)`: Creates tail polys from mask values
  and finds each entry's position in the batcher's unshifted/shifted lists by data pointer matching.
  Skips polys whose `end_index() >= dyadic_size` (already extended, e.g. ECCVM translation polys).

#### ECCVM caveat

ECCVM's `compute_translation_opening_claims()` evaluates translation polynomials (`transcript_op`,
`transcript_Px`, `transcript_Py`, `transcript_z1`, `transcript_z2`) as **univariates** and batches
them directly into opening claims. This requires the mask values to be present in the actual polynomial
data, not just in the batcher's tails. Therefore ECCVM still uses `inject_into_polynomials` to extend
all masked polys before PCS. The batcher then gets full-size polys and no tails are needed.

Ultra Honk uses `add_tails_to_batcher` (no injection).

#### Batched Honk Translator caveat

The batched translator combines MegaZK (2^16) and Translator (2^17) circuits into a joint sumcheck
at `joint_circuit_size = 2^17`. The masking regions are fundamentally mismatched:

- **MegaZK**: disabled rows at 2^16 - 4 to 2^16 - 1, masking at 2^16 - 3 to 2^16 - 1
- **Translator**: no row disabling, no masking (`UseRowDisablingPolynomial = false`)

The joint sumcheck runs 16 "real" rounds (MegaZK + Translator) then 1 "virtual" round (Translator
only, MegaZK zero-padded). Key issues:

1. **`fold_masking_values`** operates on MegaZK `round_size` (2^16, halved per round), not the joint
   circuit size. Rounds 2+ read PE neighbors at `round_size - 2` — this must be in the MegaZK PE
   space, not the translator PE space.

2. **`apply_claimed_eval_corrections`** uses `joint_challenge[0..15]` (16 real challenges) to compute
   Lagrange corrections at positions {2^16-3, 2^16-2, 2^16-1}. The corrections are written back to
   `mega_zk_partial[0]` so virtual rounds read corrected values. This is subtle: the virtual rounds
   multiply by `(1-u_k)` per round, so the corrected value propagates through.

3. **PCS**: Currently uses `inject_into_polynomials` to extend MegaZK polys to full size before
   setting up the joint batcher. This is necessary because `inject` must happen BEFORE batcher setup
   (batcher stores references that become stale if polys are extended afterward). A future optimization
   could use `add_tails_to_batcher` if the tail virtual_size (2^16) is handled correctly in the joint
   batcher context (full_batched_size = 2^17).

**Status**: The batched translator's sumcheck integration with masking tails needs further debugging.
The mismatch between MegaZK masking region (at end of 2^16) and joint circuit size (2^17) causes
verification failures. The `inject_into_polynomials` approach works for PCS but the sumcheck
corrections (`fold_masking_values`, `apply_claimed_eval_corrections`, `compute_disabled_contribution`
with masking overrides) may need adjustment for the joint context.

### No changes needed
- **Verifier**: Untouched. It already uses `(1-L)` evaluation and claimed evaluations (corrected).
- **Claimed evaluations**: `apply_claimed_eval_corrections` in `masking_tail_data.hpp` already
  handles the correction using Lagrange basis products. No change needed.
- **`oink_prover.cpp`**: Already registers masked polys in MaskingTailData. No change.

## Shifted Polynomial Handling

Shifted polys inherit their masking values from the source (to-be-shifted) poly:
```
shift[i] = unshifted[i+1]
shift[n-4] = unshifted[n-3] = mask[0]
shift[n-3] = unshifted[n-2] = mask[1]
shift[n-2] = unshifted[n-1] = mask[2]
shift[n-1] = 0
```

The shifted folded values are derived from the source entry's `mask_values`, offset by the shift.
MaskingTailData's `shifted_entries` track the `source_entry_index` into `entries`.

After round 0 for shifted polys:
```
shifted_folded[0] = mask[0] + u_0 * (mask[1] - mask[0])     // from (n-4, n-3) shifted
shifted_folded[1] = mask[2] + u_0 * (0 - mask[2])           // from (n-2, n-1) shifted
                   = mask[2] * (1 - u_0)
```

After round 1: same linear fold as unshifted.
After rounds 2+: same PE-neighbor fold as unshifted, using `shifted_entries[s].all_entities_index`.

## Testing

1. Run `ultra_honk_tests` (includes ZK and non-ZK variants)
2. Run `chonk_tests`
3. Verify non-ZK tests unchanged (no regressions from effective_round_size change, which only
   affects ZK path via `use_masking_tail` flag)
