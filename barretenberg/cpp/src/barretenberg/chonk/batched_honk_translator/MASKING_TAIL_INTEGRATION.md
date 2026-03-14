# Masking Tail Integration for Batched Honk Translator

## Context

The masking tail optimization stores ZK masking values separately in `MaskingTailData` instead of
writing them into witness polynomials. This allows witness polynomials to be allocated at their
actual trace size rather than full `dyadic_size`, saving memory.

This is already working for standalone UltraZK, MegaZK, and ECCVM flows. This document describes
the integration into the `BatchedHonkTranslatorProver`, which combines MegaZK (2^16) and
Translator (2^17) into a joint sumcheck + PCS.

## Key Architectural Facts

- **MegaZK** has `dyadic_size = 2^16`. Masking tail positions: `{2^16-3, 2^16-2, 2^16-1}`.
- **Translator** has `circuit_size = 2^17`. Full-size polynomials, **no masking tail** needed.
  `UseRowDisablingPolynomial<TranslatorFlavor> = false`.
- The joint batcher operates at `full_batched_size = 2^17`.
- MegaZK tails sit at `2^16-3..2^16-1` — in the lower half of the joint polynomial space.
- Each circuit has its own `masking_tail_data`: MegaZK's is active, Translator's is empty.

## Changes Required

### 1. Sumcheck: `do_round` lambda

**File**: `batched_honk_translator_prover.cpp`, lines 156-172

Current code uses the old `compute_disabled_contribution` signature (subtracts, takes `round_idx`):

```cpp
U_H -= mega_zk_round.compute_disabled_contribution(
    hpolys, mega_zk_params, mega_zk_gate_sep, mega_zk_alphas, round_idx, rdp);
```

Change to new signature (adds, takes `masking_tail_data` instead of `round_idx`):

```cpp
U_H += mega_zk_round.compute_disabled_contribution(
    hpolys, mega_zk_params, mega_zk_gate_sep, mega_zk_alphas, rdp, mega_zk_inst->masking_tail_data);
```

The new `compute_disabled_contribution` returns `(1-L) * H_disabled` (to be added), not
`L * H_disabled` (to be subtracted). It uses `MaskingTailData` folded values to override
masked witness poly entries at disabled positions.

### 2. Sumcheck: `excluded_tail_size` management

After round 0, set `mega_zk_round.excluded_tail_size = 2` (collapses from 2 edge pairs to 1).
This mirrors what standalone `sumcheck.hpp` does at line 560.

```cpp
// In round 0 block, after do_round:
mega_zk_round.excluded_tail_size = 2;
```

### 3. Sumcheck: `fold_masking_values` per round

**Round 0**: Call after `partially_evaluate` (no PE access needed for round 0 folding):

```cpp
// Round 0 block, after PE and rdp.update_evaluations:
mega_zk_inst->masking_tail_data.fold_masking_values(u, 0, mega_zk_round.round_size, &mega_zk_polys);
```

Note: `round_size` here is the MegaZK round size **before** the `>>= 1`.

**Rounds 1+**: Call **before** `partially_evaluate_in_place` (rounds 2+ read PE at active positions):

```cpp
// Real rounds loop, after do_round and BEFORE PE:
mega_zk_inst->masking_tail_data.fold_masking_values(
    u, round_idx, mega_zk_round.round_size, &mega_zk_partial);
```

Note: The `round_size` passed is the MegaZK round size (halving from 2^16), not the translator's.
`fold_masking_values` reads PE neighbors at `round_size - 2` which is in MegaZK PE space.

### 4. Claimed evaluation corrections

**File**: `batched_honk_translator_prover.cpp`, between eval extraction (line 203-204) and
sending (line 206).

```cpp
for (auto [eval, poly] : zip_view(mega_zk_claimed_evals.get_all(), mega_zk_partial.get_all())) {
    eval = poly[0];
}

// Apply masking tail corrections before sending
if (mega_zk_inst->masking_tail_data.is_active()) {
    auto real_challenges = std::span<const FF>(joint_challenge.data(), mega_zk_log_n);
    mega_zk_inst->masking_tail_data.apply_claimed_eval_corrections(mega_zk_claimed_evals, real_challenges);
}

transcript->send_to_verifier("Sumcheck:evaluations", mega_zk_claimed_evals.get_all());
```

Uses only the first `mega_zk_log_n` (16) challenges — the Lagrange basis products for positions
`{2^16-3, 2^16-2, 2^16-1}` only involve the 16 real sumcheck challenges, not virtual ones.

### 5. Virtual rounds: no masking changes needed

Virtual rounds (lines 212-237) see `mega_zk_partial` values that were already fully folded through
all real rounds. The claimed eval corrections were applied before virtual rounds start. The
`poly.at(0) *= (1-u)` multiplication propagates the corrected values correctly. Row-disabling is
not used in virtual rounds (only `rdp_scalar`). No masking tail interaction needed.

### 6. PCS: `add_tails_to_batcher`

**File**: `batched_honk_translator_prover.cpp`, `execute_joint_pcs()`, after batcher setup
(line 301).

```cpp
polynomial_batcher.set_to_be_shifted_by_one(joint_shifted);

// Register MegaZK masking tails with the joint batcher
if (mega_zk_inst->masking_tail_data.is_active()) {
    mega_zk_inst->masking_tail_data.add_tails_to_batcher(mega_zk_inst->polynomials, polynomial_batcher);
}
```

`add_tails_to_batcher` matches polynomials by data pointer in the batcher's
`unshifted`/`to_be_shifted` lists. MegaZK polys are at an offset in the joint unshifted list
(translator first, then MegaZK), but data-pointer matching scans the entire list so this works.

The tail polynomials have `virtual_size = 2^16` and `start = 2^16 - 3`. They sit correctly
within the 2^17-sized batcher — Gemini's `compute_batched` adds them at the right positions
via `Polynomial::add_scaled`.

## Ordering of Operations (Full Round)

### Round 0
```
1. do_round(mega_zk_polys, translator_polys, 0)
   - compute_univariate (active edges, excludes last 4 rows)
   - compute_disabled_contribution (returns 0 since (1-L)=0)
   - compute translator univariate
   - send_round → get challenge u_0
2. partially_evaluate both circuits
3. rdp.update_evaluations(u, 0)
4. fold_masking_values(u, 0, round_size_before_halving, &mega_zk_polys)
5. mega_zk_round.round_size >>= 1
6. mega_zk_round.excluded_tail_size = 2
7. update_round_state(0, u)
```

### Rounds 1..mega_zk_log_n-1
```
1. do_round(mega_zk_partial, translator_partial, round_idx)
   - compute_univariate (active edges, excludes last 2 rows)
   - compute_disabled_contribution (with masking overrides, * (1-L))
   - compute translator univariate
   - send_round → get challenge u_i
2. fold_masking_values(u, round_idx, round_size_before_halving, &mega_zk_partial)
3. partially_evaluate_in_place both circuits
4. rdp.update_evaluations(u, round_idx)
5. mega_zk_round.round_size >>= 1
6. update_round_state(round_idx, u)
```

### After real rounds, before virtual rounds
```
1. Extract mega_zk_claimed_evals from mega_zk_partial[0]
2. apply_claimed_eval_corrections(mega_zk_claimed_evals, challenges[0..15])
3. Send mega_zk_claimed_evals
```

### Virtual rounds mega_zk_log_n..JOINT_LOG_N-1
```
(No masking tail interaction — corrections already applied)
```

## Testing

1. `ultra_honk_tests` — UltraZK and MegaZK standalone (already passing)
2. `eccvm_tests` — ECCVM with masking tails (already passing)
3. `batched_honk_translator_tests` — Batched translator flow (target for this integration)
4. `chonk_tests` — Full Chonk end-to-end (after batched_honk_translator_tests are green)
