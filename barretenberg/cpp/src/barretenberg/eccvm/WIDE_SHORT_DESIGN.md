# ECCVM Wider-and-Shorter: Design Spec

## Goal

Halve the Precomputed and MSM table heights by doubling their width (`WNAF_DIGITS_PER_ROW` 4→8, `ADDITIONS_PER_ROW` 4→8). This halves the number of rows consumed per scalar, so with `CONST_ECCVM_LOG_N` staying at 15 we can handle twice as many scalar multiplications — i.e. **double the stack depth**.

Alternatively, if stack depth is sufficient, `CONST_ECCVM_LOG_N` could drop from 15→14, halving the IPA MSM and speeding up native proving and root rollup verification.

## Impact

Here, "split" refers to the option of splitting up the multiset-equality check into three wires, which would help with the degree. However, this seems to not be especially critical.

| Metric | Before | After (no split) | After (with split) |
|--------|:------:|:-----------------:|:------------------:|
| NUM_WIRES | 85 | 121 (+36) | 123 (+38) |
| Precompute rows/scalar | 8 | 4 | 4 |
| MSM ADD rows/digit | ⌈m/4⌉ | ⌈m/8⌉ | ⌈m/8⌉ |
| MSM doubling rows | 31 | 16 (with Step 3) | 16 |
| MSM row formula | `33·⌈m/4⌉+31` | `33·⌈m/8⌉+16` | `33·⌈m/8⌉+16` |
| MAX_PARTIAL_RELATION_LENGTH | 22 | 29 | 17 |
| ECCVM proof size (Fr) | 608 | 756 (+148) | ~764 (+156) |

The split adds +2 columns (z_perm_b, z_perm_c) and +8 proof elements but drops degree from 29→17.

Note: proof size = 756 was confirmed via `static_assert` in `proof_compression.hpp`.

## Implementation plan

### Step 1: Widen tables (ADDITIONS_PER_ROW + WNAF_DIGITS_PER_ROW, together)

These **cannot** be separated: the lookup relation's table terms reference `Tx2/Ty2` (from WNAF widening) but also need `NUM_LOOKUP_TERMS = 8` (from additions widening). Ship as one diff.

#### 1a. Constants

**`eccvm_builder_types.hpp`:**
```cpp
WNAF_DIGITS_PER_ROW = 8;        // was 4
ADDITIONS_PER_ROW = 8;           // was 4
DOUBLINGS_PER_ROW = NUM_WNAF_DIGIT_BITS; // NEW, always 4
```

#### 1b. Builders

**`msm_builder.hpp`:**
- `MSMRow::add_state`: `std::array<AddState, 4>` → `<AddState, ADDITIONS_PER_ROW>` (line 64)
- DOUBLE loop (line 358): change bound from `ADDITIONS_PER_ROW` to `DOUBLINGS_PER_ROW`
- Trace sizing (lines 243, 288): replace hardcoded `* 4` with `* ADDITIONS_PER_ROW`
- All other loops already use `ADDITIONS_PER_ROW` — auto-adjust

**`precomputed_tables_builder.hpp`:**
- Remove `static_assert(WNAF_DIGITS_PER_ROW == 4)` (line 66) and `num_rows_per_scalar == POINT_TABLE_SIZE / 2` (line 57)
- `PointTablePrecomputationRow`: add `s9..s16` (8 more 2-bit slices), add `precompute_accumulator2`
- `num_rows_per_scalar` = 32/8 = 4. Each row stores 2 precomputed points: `table[POINT_TABLE_SIZE - 1 - 2*i]` and `table[POINT_TABLE_SIZE - 2 - 2*i]`
- Digit loop: 8 digits → 16 two-bit slices (s1–s16)
- Horner: `prev_sum * 2^32 + row_chunk` (was `2^16`)

#### 1c. Flavor columns

**`eccvm_flavor.hpp` — add to `WireNonShiftedEntities` (+36 columns):**

| Group | New columns | Count |
|-------|------------|:-----:|
| Precompute slices | `precompute_s5hi..s8lo` | +8 |
| Precompute 2nd point | `precompute_tx2, precompute_ty2` | +2 |
| MSM adds | `msm_add5..add8` | +4 |
| MSM points | `msm_x5..x8, msm_y5..y8` | +8 |
| MSM collision | `msm_collision_x5..x8` | +4 |
| MSM lambdas | `msm_lambda5..lambda8` | +4 |
| MSM slices | `msm_slice5..slice8` | +4 |
| Lookup read counts | `lookup_read_counts_2, _3` | +2 |

Wire up in `eccvm_circuit_builder.hpp` `ProverPolynomials` constructor (follows existing patterns at lines 706–713).

#### 1d. Relations

**`ecc_msm_relation_impl.hpp`:**
- Extend addition chain 4→8, skew chain 4→8. Doubling chain unchanged in Step 1 (4, lambda1–4); widened to 8 in Step 3.
- 4 new add slope subrelations + 4 skew slope subrelations (separate to prevent cancellation)
- Extend collision checks, slice-zero, addition continuity, count update to 8
- Cross-row: `(-add8 + 1) * add1_shift`. Max partial length: 8→**12**.

**`ecc_set_relation_impl.hpp` (ECCVMSetRelation — unchanged structure):**
- Numerator: 8 slice fingerprints instead of 4 (degree 7→11), round encoding `8 * precompute_round + j`
- Denominator: 8 add-gated tuples instead of 4 (degree 8→16 in slice sub-product, total denom degree 27)
- `eccvm_set_permutation_delta`: product of 8 terms instead of 4 (update in prover + verifier)
- `SUBRELATION_PARTIAL_LENGTHS = {29, 3}` (was `{22, 3}`)

**`ecc_lookup_relation.hpp`:**
- `NUM_LOOKUP_TERMS = 8`, `NUM_TABLE_TERMS = 4`, `LENGTH = 15`
- 4 table terms: positive/negative for each of 2 points per precompute row
- Coverage: `{0..15}` fully covered (verify in tests)

**`ecc_wnaf_relation_impl.hpp`:**
- 8 extra range checks (s5hi–s8lo), Horner for 8 digits, `* 2^32` shift
- Round: 0–3 (was 0–7), replace hardcoded `7` with `WNAF_DIGITS_PER_ROW - 1`

**`ecc_point_table_relation_impl.hpp`:**
- Add intra-row constraint: `(Tx, Ty) = (Tx2, Ty2) + (Dx, Dy)`
- Doubling target: `2 * (Tx2, Ty2)` at transitions (Tx2 = 1·P, not Tx = 3·P)
- Inter-row addition links via Tx2. Subrelations: 6→8.

**`ecc_bools_relation_impl.hpp`:** +4 boolean checks for `msm_add5..8`.

#### 1e. Post-widening MAX_PARTIAL_RELATION_LENGTH (no split)

| Relation | Partial length |
|----------|:---:|
| Set (combined GP) | **29** |
| Lookup | 15 |
| MSM | 12 |
| WNAF | 5 |
| Point Table | 6 |
| Bools | 3 |
| **MAX** | **29** |

### Step 2: Constants, VKs, recursive verifier

- Update `SUBRELATION_PARTIAL_LENGTHS` in `ecc_set_relation.hpp` to `{29, 3}`
- Update static_asserts in `mock_verifier_inputs.test.cpp`
- Check `proof_compression.hpp` for hardcoded offsets
- Update `constants.nr`, run `yarn remake-constants`
- Regenerate VKs: `./test_chonk_standalone_vks_havent_changed.sh --update_inputs`
- Recursive verifier: relation changes auto-propagate via templates. Flavor entity changes (new columns) need manual mirroring in `stdlib/eccvm_verifier/`

### Step 3: Double the doublings per row (DOUBLINGS_PER_ROW 4→8)

Pack 2 doubling rounds into 1 row, cutting doubling rows from 31 to 16 per MSM. This requires **no new columns**: on doubling rows, `lambda5..lambda8` are unused (they're only for addition slots 5-8 on add rows), and `q_add`/`q_double`/`q_skew` are mutually exclusive. So we reuse `lambda5..lambda8` for the second set of 4 doublings on doubling rows.

**Why this matters:** Without this, the 8-wide change only achieves ~1.65x capacity (28 apps) instead of the expected 2x. The 31 doubling rows per MSM are a fixed cost that doesn't benefit from the additions widening. With this fix, the MSM row formula changes:

| | Old (4-wide) | After Step 1 (8-wide, 4 dbl/row) | After Step 3 (8-wide, 8 dbl/row) |
|--|:--:|:--:|:--:|
| MSM rows | `33·⌈m/4⌉ + 31` | `33·⌈m/8⌉ + 31` | `33·⌈m/8⌉ + 16` |
| Max apps (LOG_N=15) | 17 | 28 | ~30 |

#### 3a. Constants

**`eccvm_builder_types.hpp`:**
```cpp
DOUBLINGS_PER_ROW = 2 * NUM_WNAF_DIGIT_BITS; // was NUM_WNAF_DIGIT_BITS (4), now 8
```

#### 3b. Builder (`msm_builder.hpp`)

The doubling loop (currently iterating `DOUBLINGS_PER_ROW = 4` times per doubling row) now iterates 8 times. Each doubling row performs 8 point doublings (= 2 rounds of 4 doublings each = multiply accumulator by 2^8 = 256).

- The doubling row generation loop at line ~346 already uses `DOUBLINGS_PER_ROW` — it will auto-adjust to 8.
- The number of doubling rows changes: currently `NUM_WNAF_DIGITS_PER_SCALAR - 1 = 31` rows. With 2 rounds per row: `ceil(31/2) = 16` rows. But 31 is odd, so the last doubling row only does 4 doublings (1 round), not 8. Must handle this: either pad to 32 rounds (adding an extra no-op doubling at the start), or track a "half-doubling" flag for the last row.

**Simplest approach:** Keep 31 rounds, emit `ceil(31/2) = 16` doubling rows. The first 15 rows each do 8 doublings (2 rounds). The last row does 4 doublings (1 round) with `lambda5..8` unused/zeroed. The relation must handle this — use the existing `add_state[i].point` slots for "is this doubling slot active" or simply check if `point_idx < actual_doublings_this_row`.

Actually, even simpler: the relation doesn't need to know whether a doubling slot is "active" — the doubling chain is purely sequential. If we always do 8 doublings, the last doubling row would do an extra 4 doublings that shouldn't happen. So we need a selector or convention:

**Option A (recommended):** Change from 31 to 30 doubling rounds by adjusting the Straus algorithm: use `NUM_WNAF_DIGITS_PER_SCALAR = 32` digit slots but start the MSM at digit 31 instead of digit 32. This makes the number of inter-digit doublings 30 (even), giving exactly 15 doubling rows with 8 doublings each. This requires a small tweak to the scalar decomposition — the leading digit is constrained to be in a smaller range (no change to security, just a tighter range check on the most significant digit).

**Option B:** Keep 31 doubling rounds, emit 16 rows. The last row uses only 4 doublings (lambda1..4). Gate the second set of 4 doublings with a new boolean column `q_double_second` (or reuse a spare signal, e.g. the last doubling row has `msm_round` that distinguishes it). Alternatively, the relation just checks: if `round == 0` (first round after the leading digit), only 4 doublings; otherwise, 8.

**Option C (simplest):** Add one extra dummy doubling round (32 total inter-digit gaps by starting from an identity-like state), making it 32 rounds = 16 rows × 8 doublings. The extra doubling at the end is a no-op since the skew round follows.

Recommend **Option B** — it's the most straightforward and doesn't change the scalar decomposition. The relation already has `q_double` and `round` available. On a "half" doubling row, constrain `acc_x_shift = x_d4` (after 4 doublings) instead of `acc_x_shift = x_d8` (after 8). The condition is: this is the last doubling row, i.e., the row where `round` transitions from digit 0 to the skew round. In practice, every other doubling row can be detected by checking if the *next* doubling row follows (via `q_double_shift`) or if an add/skew row follows.

#### 3c. Relation (`ecc_msm_relation_impl.hpp`)

Currently the doubling chain does:
```
[x_d1, y_d1] = dbl(acc_x, acc_y, lambda1)
[x_d2, y_d2] = dbl(x_d1, y_d1, lambda2)
[x_d3, y_d3] = dbl(x_d2, y_d2, lambda3)
[x_d4, y_d4] = dbl(x_d3, y_d3, lambda4)
constrain: acc_x_shift = x_d4, acc_y_shift = y_d4
```

Extend to:
```
[x_d5, y_d5] = dbl(x_d4, y_d4, lambda5)
[x_d6, y_d6] = dbl(x_d5, y_d5, lambda6)
[x_d7, y_d7] = dbl(x_d6, y_d6, lambda7)
[x_d8, y_d8] = dbl(x_d7, y_d7, lambda8)
```

For a "full" doubling row (2 rounds): `acc_shift = (x_d8, y_d8)`
For a "half" doubling row (1 round, last one): `acc_shift = (x_d4, y_d4)`

The output constraint becomes:
```
q_double * q_double_shift * (acc_x_shift - x_d8) = 0  // full: next row is also double
q_double * (-q_double_shift + 1) * (acc_x_shift - x_d4) = 0  // half: next row is NOT double
```
(Same for y.) This adds 2 subrelations and replaces the existing 2 output subrelations (indices 10, 11). Max degree: `q_double * q_double_shift * (acc_x_shift - x_d8)` = degree 1+1+1 = 3. No increase to MSM relation max partial length (still 12).

New doubling slope subrelations for `lambda5..8`: 4 new subrelations (same structure as existing `double_slope_relation1..4`). Total MSM subrelations: 67 + 4 + 2 = ~73. (The +2 is for splitting the output constraint into full/half cases; the original 2 are replaced.)

#### 3d. Row tracker (`eccvm_row_tracker.hpp`)

Update `num_eccvm_msm_rows`:
```cpp
const size_t num_double_rounds = eccvm::NUM_WNAF_DIGITS_PER_SCALAR - 1; // 31
const size_t num_double_rows = (num_double_rounds + 1) / 2; // ceil(31/2) = 16
```

#### 3e. Capacity impact

With `DOUBLINGS_PER_ROW = 8`:
- MSM rows per MSM: `33 * ceil(m/8) + 16` (was `33 * ceil(m/8) + 31`)
- Per-app saving: ~15 fewer doubling rows per MSM × ~2 MSMs per app ≈ ~30 rows/app
- Expected max apps at LOG_N=15: ~30 (up from 28, closer to the theoretical 2x of 34)

#### 3f. No new columns needed

This is key: `lambda5..lambda8` already exist in the flavor for additions 5-8. On doubling rows (`q_double = 1`), additions are inactive (`q_add = 0`), so `lambda5..8` are free to be repurposed for doublings 5-8. The relation just needs to read them in both the addition and doubling sections, gated by the respective selectors.

### Step 4: Test and measure

- `eccvm_tests` after doubling widening
- `chonk_tests` MaxCapacityPassing — verify increased capacity
- Measure actual workload row counts → decide if `CONST_ECCVM_LOG_N` can drop 15→14
- If yes: update `constants.hpp`, cascade to Noir/TS

### Step 5 (optional): Grand product split

Split the single `ECCVMSetRelation` grand product into 3 independent ones to drop `MAX_PARTIAL_RELATION_LENGTH` from 29→17. Only worth doing if degree 29 causes measurable performance issues.

**Key constraint: `compute_grand_products<Flavor>()` supports exactly one GP per relation class** — it calls `get_grand_product_polynomial()` (singular) and `compute_grand_product_numerator/denominator()` (each returning a single scalar). There is no index-templated overload. So you must create **3 separate relation classes**, not one relation with 3 sub-products.

**New relation classes** (replace `ECCVMSetRelation`):
- `ECCVMSetRelationSlices` — GP A: `(pc, round, wnaf_slice)` multiset. N = slice fingerprints + skew + delta. D = add-gated `(pc, round, slice)` from MSM.
- `ECCVMSetRelationPointTable` — GP B: `(pc, Px, Py, scalar)` multiset. N = point-table tuples at `point_transition`. D = transcript `z1/z2` scalar tuples.
- `ECCVMSetRelationMSMOutput` — GP C: `(pc, acc_x, acc_y, msm_size)` multiset. N = MSM accumulator at `msm_transition`. D = transcript MSM output.

Each class provides its own `get_grand_product_polynomial()`, `compute_grand_product_numerator/denominator()`, `accumulate()`, and `skip()`.

**Post-split degrees (with widening):**

| GP | Numerator degree | Denominator degree | Partial length |
|----|:---:|:---:|:---:|
| A (slices) | 15 | 16 | **17** |
| B (point-table) | 9 | 7 | **10** |
| C (MSM output) | 11 | 4 | **12** |

**Flavor changes:**
- Add `z_perm_b`, `z_perm_c` to `DerivedWitnessEntities`
- Add `z_perm_b_shift`, `z_perm_c_shift` to shifted entities + `get_to_be_shifted()`
- Update `GrandProductRelations` tuple: `std::tuple<ECCVMSetRelationSlices<FF>, ECCVMSetRelationPointTable<FF>, ECCVMSetRelationMSMOutput<FF>>`

**Each new relation's `skip()`:** Must check its own z_perm, not the others.

**Constants cascade:** +2 commitments × 2 Fr + 4 evaluations × 1 Fr = ~8 Fr added to proof. Update static_asserts, Noir constants, VKs.

## Why the grand product split is optional

The original plan required splitting the grand product to "keep relation degrees sane." Analysis shows this isn't load-bearing:

**Without split, after widening:** `MAX_PARTIAL_RELATION_LENGTH` goes from 22 → **29**. The combined denominator grows because the slice sub-product doubles (degree 8→16), making the cumulative denominator degree 16+6+4 = 26. The full accumulate expression `(z_perm + lagrange_first) * numerator - (z_perm_shift + lagrange_last) * denominator` has degree max(1+16, 1+26) = 27, partial length 28. We set `SUBRELATION_PARTIAL_LENGTHS[0] = 29` as a conservative upper bound. (Sub-product degrees: 16 for 8 add-gated tuples, 6 for transcript z1/z2, 4 for MSM output.)

**Why degree 29 is acceptable:**

1. **Sumcheck is ~40% of ECCVM proving (~500ms).** Higher degree means the prover sends a larger univariate polynomial per sumcheck round (29 evaluations instead of 22). This is a ~30% increase in sumcheck work — so maybe +150ms. That's noise compared to the IPA MSM savings from dropping `log_N` (which saves seconds in the recursive verifier).

2. **Per-round communication doesn't change structurally.** The prover still sends one univariate per round for `log2(N)` rounds. Each univariate is just a few more field elements. Total sumcheck proof overhead: `(29-22) × log2(N) = ~100 extra Fr` — dwarfed by the IPA MSM savings.

3. **The recursive verifier is only 215K gates total.** A higher-degree sumcheck means ~7 extra multiplications per round to evaluate the univariate (Horner's method, degree 28 vs 21). Over `log2(N) = 14` rounds that's ~98 extra gates — 0.05% of the 215K total. Negligible.

4. **The GP split adds complexity for little benefit:** 3 new relation classes, 2 extra z_perm polynomials (+2 commitments, +4 evaluations in the proof), flavor/prover/verifier changes, and more surface area for bugs. All to save ~150ms of sumcheck time.

**Bottom line:** Ship the widening without the split. If degree 29 turns out to matter later, the split can be done as a follow-up.

## Corrections to the original spec / previous version of this plan

1. **"Grand product split is required alongside the widening"** — It isn't. Sumcheck is ~40% of ECCVM proving (~500ms). Going from degree 22 to 29 adds ~30% to sumcheck cost (~150ms), which is negligible vs. the IPA MSM savings from dropping `log_N`. The recursive verifier is only 215K gates — a few extra gates per sumcheck round for higher-degree univariates doesn't matter. The split is a nice-to-have, not a prerequisite.

2. **"One relation with 3 indexed grand products"** — The `compute_grand_product` library doesn't support this. `get_grand_product_polynomial()` returns a single polynomial; `compute_grand_product_numerator/denominator()` each return a single scalar. One GP per relation class. Must create **3 separate relation classes** in `GrandProductRelations`.

3. **"Steps 2 and 3 (additions vs digits) can be done independently"** — They can't. The lookup table terms reference `Tx2/Ty2` (from WNAF widening) but need `NUM_LOOKUP_TERMS = 8` (from additions widening). Circular dependency. Ship together.

4. **"Step 4: Wire up builders → flavor" as separate step** — Not a real step. You can't add flavor columns without wiring the builder. These are part of the same diff.

5. **The degree analysis (corrected sub-product breakdown).** Current denominator is degree 18 (sub-products: 8 + 6 + 4 = 18). After widening without split, slice sub-product doubles (degree 8→16), making total denominator degree 16+6+4 = 26. The full GP subrelation degree is max(1+numerator, 1+denominator) = max(17, 27) = 27, partial length 28. We set `SUBRELATION_PARTIAL_LENGTHS[0] = 29` as a conservative upper bound. After widening with split, each GP carries only its own sub-product, so the bottleneck is GP A.
