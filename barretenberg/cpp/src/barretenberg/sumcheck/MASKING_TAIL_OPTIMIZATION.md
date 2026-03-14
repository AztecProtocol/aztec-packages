# Masking Tail Optimization: Short Witness Polynomials in ZK Sumcheck

## Problem

Witness polynomials are allocated to `trace_active_range` (shorter than `dyadic_size`) to save memory.
The last `NUM_MASKED_ROWS` positions (n-3, n-2, n-1) contain zeros instead of actual masking values.
Masking values are stored separately in `MaskingTailData`.

The 4 disabled rows (n-4, n-3, n-2, n-1) are zeroed out by the row-disabling polynomial `(1-L)`.
The main sumcheck loop now excludes the disabled edge pairs entirely; the disabled contribution
is computed separately by `compute_disabled_contribution` with masking overrides from `MaskingTailData`,
multiplied by `(1-L)`, and **added** to the active contribution.

## Mathematical Background

The modified relation is `sum_H (1-L) * H = 0` where `L = L_{n-1} + L_{n-2} + L_{n-3} + L_{n-4}`.

The round univariate decomposes as:

```
S'_i(X) = S_{active,i}(X) + (1 - L^{(i)}(X)) * H_disabled^{(i)}(X)
```

The `(1-L)` factor per round:
- Round 0: `L^{(0)}(X) = 1` (constant) => `(1-L) = 0` => disabled contribution is 0
- Round 1: `L^{(1)}(X) = X` => `(1-L) = (1-X)`
- Round i>=2: `L^{(i)}(X) = u_2*...*u_{i-1} * X` => `(1-L) = 1 - u_2*...*u_{i-1}*X`

## Critical: `excluded_tail_size` guards

The `excluded_tail_size` member of `SumcheckProverRound` controls how many edge pairs are excluded
from the main `compute_univariate` loop and handled by `compute_disabled_contribution` instead.

**It must be non-zero ONLY when both conditions hold:**
1. `Flavor::HasZK == true` (ZK mode is active)
2. `UseRowDisablingPolynomial<Flavor> == true` (the flavor uses row disabling)

The correct initialization is:
```cpp
size_t excluded_tail_size = (Flavor::HasZK && UseRowDisablingPolynomial<Flavor>) ? 4 : 0;
```

**Flavors that must NOT have excluded rows:**
- Non-ZK flavors (MegaFlavor, UltraFlavor, MultilinearBatchingFlavor) — `HasZK = false`
- TranslatorFlavor — `UseRowDisablingPolynomial = false` (translator uses its own ZK mechanism)

**Failure mode if wrong:** If `excluded_tail_size > 0` for a flavor that doesn't call
`compute_disabled_contribution`, those edge pairs are silently dropped from the sum, causing
sumcheck round consistency failures (`S(0) + S(1) != target`).

Similarly, `round.excluded_tail_size = 2` (set after round 0) must be guarded:
```cpp
if constexpr (UseRowDisablingPolynomial<Flavor>) {
    round.excluded_tail_size = 2;
}
```

## `compute_effective_round_size` behavior per flavor type

The function determines how many edge pairs `compute_univariate` processes:

| Flavor type | `excluded_tail_size` | `get_witness()` available | Behavior |
|---|---|---|---|
| ZK + row disabling (MegaZK, UltraZK) | 4 (then 2) | Yes | `min(round_size - excluded, witness_end)` |
| ZK + row disabling, no `get_witness()` (PE) | 4 (then 2) | No | `round_size - excluded` |
| ZK, no row disabling (Translator) | 0 | No | `round_size` (full iteration) |
| Non-ZK (Mega, Ultra, MultilinearBatching) | 0 | Yes | `min(round_size, witness_end)` |
| Non-ZK, no `get_witness()` | 0 | No | `round_size` |

## Approach

### 1. Main loop: active edges only

`compute_effective_round_size` excludes disabled rows by capping at `round_size - excluded_tail_size`.
It also finds `max_end_index` across witness polynomials (via `get_witness()` if available) and takes
the minimum. For non-ZK flavors, the witness-end optimization applies without any tail exclusion.

### 2. Disabled contribution: use real masking values

`compute_disabled_contribution` iterates over disabled edge pairs, reads polynomial values via
`extend_edges`, then overrides masked witness poly entries with folded values from `MaskingTailData`.
The result is multiplied by `(1-L)` and **added** to `S_active`.

### 3. Folding masking values across rounds

MaskingTailData tracks folded masking values per entry via the `FoldedValues` struct.

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
```
active_neighbor = PE_all[entry.all_entities_index][round_size - 2]
folded[0] = active_neighbor + u_i * (folded[0] - active_neighbor)
```

#### Fold timing

- **Round 0**: `fold_masking_values` called **after** `partially_evaluate_first_round` (no PE access needed).
- **Rounds 1+**: `fold_masking_values` called **before** `partially_evaluate_in_place` (rounds 2+
  read active neighbor values from PE before they are overwritten).

### 4. Disabled contribution construction

```
for each disabled edge_idx (round_size - excluded_tail_size .. round_size):
    extend_edges(extended_edges, polynomials, edge_idx);

    // Override masked witness poly entries with folded masking values
    if folded_count > 0:
        for each entry: override edge with folded values
        for each shifted_entry: override edge with shifted folded values

    accumulate_relation_univariates(...);

// Multiply by (1-L)
result *= one_minus_L_extended;
```

### 5. Specific round behavior

**Round 0**: `(1-L) = 0`, disabled contribution returns zero. `excluded_tail_size = 4`.

**Round 1**: `excluded_tail_size = 2`. `folded_count == 2`, override both even and odd positions.
Multiply by `(1-X)`.

**Round i>=2**: `excluded_tail_size = 2`. `folded_count == 1`. Even position is active (correct in PE).
Override only odd position. Multiply by `(1 - u_2*...*u_{i-1}*X)`.

## Implementation Details

### `sumcheck_round.hpp`

- `excluded_tail_size`: Initialized to `(HasZK && UseRowDisablingPolynomial) ? 4 : 0`. Set to 2
  after round 0 (guarded by `UseRowDisablingPolynomial`).
- `compute_effective_round_size`: Caps at `round_size - excluded_tail_size` when `excluded_tail_size > 0`.
  For ZK flavors without row disabling (Translator), returns `round_size` unconditionally.
  For non-ZK flavors, returns `min(round_size, witness_end_index)`.
- `compute_disabled_contribution`: Takes `MaskingTailData`, overrides masked witness poly values,
  multiplies by `(1-L)`, returns result to be **added** to round univariate.

### `sumcheck.hpp`

- ZK `prove()`: calls `compute_disabled_contribution` guarded by `UseRowDisablingPolynomial<Flavor>`.
- `excluded_tail_size = 2` update after round 0 also guarded by `UseRowDisablingPolynomial<Flavor>`.
- `fold_masking_values` called per round. `apply_claimed_eval_corrections` called after all rounds.

### `masking_tail_data.hpp`

- `FoldedValues`: `std::array<FF, 2> values` + `size_t count` (2 after round 0, 1 after round 1+).
- `fold_masking_values(challenge, round_idx, round_size, pe)`: Folds per round. Rounds 2+ need PE.
- `inject_into_polynomials`: Writes mask values back into polys (used by ECCVM).
- `apply_claimed_eval_corrections`: Lagrange-basis corrections using real challenges only.
- `add_tails_to_batcher`: Creates small tail polys for PCS batching (used by Ultra Honk).

### PCS tail batching (`gemini.hpp` PolynomialBatcher)

Small tail polynomials (NUM_MASKED_ROWS values at positions {n-3, n-2, n-1}) are batched alongside
their base polynomials using the same rho scalar.

- `add_unshifted_tail(index, tail)` / `add_shifted_tail(index, tail)`: Register tails.
- `compute_batched`: Tails batched with `challenge.pow(index)` scalar.
- ECCVM uses `inject_into_polynomials` instead (needs univariate evaluation of translation polys).
- Ultra Honk uses `add_tails_to_batcher` (no injection needed).

### Batched Honk Translator integration

The batched translator combines MegaZK (2^d) and Translator (2^17) into a joint sumcheck.

**Key points:**
- MegaZK has masking tail; Translator does not (full-size polys, no row disabling).
- `excluded_tail_size` is correct for both: MegaZK gets 4→2, Translator gets 0.
- `fold_masking_values` uses MegaZK's `round_size` (not joint), reads MegaZK PE.
- `apply_claimed_eval_corrections` uses first `mega_zk_log_n` challenges only.
- After corrections, write values back into `mega_zk_partial[0]` so virtual rounds
  (`compute_virtual_contribution`) use corrected evaluations.
- PCS: `add_tails_to_batcher` on the joint batcher. Tails at MegaZK positions (2^d - 3..2^d - 1)
  sit correctly within the 2^17-sized batcher.

## Shifted Polynomial Handling

Shifted polys inherit masking values from the source (to-be-shifted) poly:
```
shift[n-4] = unshifted[n-3] = mask[0]
shift[n-3] = unshifted[n-2] = mask[1]
shift[n-2] = unshifted[n-1] = mask[2]
shift[n-1] = 0
```

After round 0 for shifted polys:
```
shifted_folded[0] = mask[0] + u_0 * (mask[1] - mask[0])     // from (n-4, n-3)
shifted_folded[1] = mask[2] * (1 - u_0)                     // from (n-2, n-1)
```

After round 1: same linear fold as unshifted.
After rounds 2+: same PE-neighbor fold, using `shifted_entries[s].all_entities_index`.

## Testing

1. `ultra_honk_tests` — UltraZK and MegaZK standalone
2. `eccvm_tests` — ECCVM with masking tails
3. `translator_vm_tests` — Translator standalone (verifies no regression from excluded_tail_size)
4. `batched_honk_translator_tests` — Batched MegaZK + Translator
5. `chonk_tests` — Full Chonk end-to-end (exercises MultilinearBatching, fold, decider paths)
6. `sumcheck_tests` — Unit tests for sumcheck round logic
