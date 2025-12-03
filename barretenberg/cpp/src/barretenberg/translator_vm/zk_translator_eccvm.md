# Full-Randomness Hiding Op for Translator/ECCVM

## Problem Statement

Currently, the `accumulated_result` in Translator is masked using a valid on-curve point with a random scalar (`hide_op_queue_accumulation_result` in `chonk.cpp`). This provides only **~128 bits of randomness** because:

1. The scalar is split into two 128-bit endomorphism scalars `z1`, `z2`
2. The point must be on the BN254 curve (constrained by ECCVM's on-curve check)
3. Only the scalar contributes randomness to the batched evaluation

This provides **computational hiding** but not **statistical hiding**.

## Proposed Solution

Add a "Translator-valid" hiding op with fully random `Px`, `Py` field elements (~254 bits each) that:

1. Goes to **both** `ultra_ops_table` and `eccvm_ops_table`
2. Lands at a **fixed row** in ECCVM (row 1, identified by `lagrange_second`)
3. Is processed normally by **Translator** (which has no on-curve check)
4. Is **skipped** by ECCVM relations that would fail on non-curve points

### Result

The translation check `x · accumulated_result == op(x) + v·Px(x) + v²·Py(x) + v³·z1(x) + v⁴·z2(x) - masking_term` now includes contributions from fully random `Px`, `Py` field elements, providing **full statistical hiding** (~254 bits).

---

## Background: Current Architecture

### Translation Check

The ECCVM and Translator are linked via the translation check (see `translator_verifier.cpp:163-196`):

```
x · accumulated_result == Σᵢ Tᵢ(x) · vⁱ - masking_term
```

Where `Tᵢ` are the transcript polynomials `{op, Px, Py, z1, z2}` evaluated as **univariates** at challenge `x`.

### Key Insight

The univariate evaluation sums over **all rows** of the transcript polynomials. Even if a row doesn't perform actual EC computation, its `Px`, `Py` values still contribute to `Px(x)`, `Py(x)`.

### Current Hiding Op Location

Currently `hide_op_queue_accumulation_result` is called in the **hiding kernel** (`HN_FINAL`), placing the hiding op at the **end** of the op queue. This makes it difficult to identify at a fixed row index.

---

## Detailed Design

### 1. Move Hiding Op to Tail Kernel

**File:** `barretenberg/cpp/src/barretenberg/chonk/chonk.cpp`

Move the hiding op to the tail kernel, placed **after** the random non-ops. Since random non-ops are Ultra-only (don't go to ECCVM), the hiding op is still the **first real ECCVM op** and lands at row 1:

```cpp
// In complete_kernel_circuit_logic(), for is_tail_kernel:
if (is_tail_kernel) {
    BB_ASSERT_EQ(circuit.op_queue->get_current_subtable_size(), 0U);

    circuit.queue_ecc_no_op();  // For shiftability (row 0 = zeros in ECCVM)
    hide_op_queue_content_in_tail(circuit);  // 3 random non-ops (Ultra-only, NOT in ECCVM)

    // NEW: Add hiding op - first real ECCVM op, lands at row 1 (lagrange_second)
    hide_op_queue_accumulation_result(circuit);  // Modified version
}
```

**Why this works:** The random non-ops from `hide_op_queue_content_in_tail` only go to `ultra_ops_table`, not `eccvm_ops_table`. So in ECCVM:
- Row 0: zeros (from no-op, for shiftability)
- Row 1: hiding op (`lagrange_second = 1`)
- Row 2+: actual ops from circuits

### 2. Modify Hiding Op to Use Random Field Elements

**File:** `barretenberg/cpp/src/barretenberg/chonk/chonk.cpp`

Change `hide_op_queue_accumulation_result` to use random field elements instead of a valid curve point:

```cpp
void Chonk::hide_op_queue_accumulation_result(ClientCircuit& circuit)
{
    // Random field elements (NOT on curve)
    Fq random_Px = Fq::random_element();
    Fq random_Py = Fq::random_element();

    // z1, z2 can be any 128-bit values (range-constrained in Translator)
    // Setting to zero for simplicity - the randomness from Px, Py (~508 bits) is sufficient

    // Queue as a special "hiding op" that goes to both tables
    circuit.queue_ecc_hiding_op(random_Px, random_Py);
}
```

### 3. New ECCOpQueue Method

**File:** `barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp`

Add a new method to queue the hiding op:

```cpp
void queue_ecc_hiding_op(const Fq& Px, const Fq& Py);
```

**File:** `barretenberg/cpp/src/barretenberg/op_queue/ecc_op_queue.hpp`

The hiding op is pushed to **both** tables with no special marker - it's identified purely by its position (first op in `eccvm_ops`, row 1 in ECCVM transcript):

- `eccvm_ops_table`: Standard entry with random Px, Py field elements, `q_eq = 1`
- `ultra_ops_table`: Normal UltraOp format with Px, Py decomposed into limbs

**No new opcode flag needed** - all special handling is index-based in builders and lagrange-based in relations.

---

## ECCVM Modifications

### 4. Add `lagrange_third` Selector

**File:** `barretenberg/cpp/src/barretenberg/eccvm/eccvm_flavor.hpp`

Currently ECCVM has:
- `lagrange_first` (row 0): zeros for shiftability
- `lagrange_second` (row 1): first real op, accumulator empty constraint

With the hiding op at row 1, we need to shift the "first real op" semantics to row 2:

| Row | Selector | Purpose |
|-----|----------|---------|
| 0 | `lagrange_first` | Zeros (shiftability) - unchanged |
| 1 | `lagrange_second` | **NEW:** Hiding op row - skip on-curve check, no computation |
| 2 | `lagrange_third` | **NEW:** Takes over old `lagrange_second` role - first real op |
| 3+ | - | Actual ops |

Add to `PrecomputedEntities`:
```cpp
DEFINE_FLAVOR_MEMBERS(DataType,
                      lagrange_first,   // column 0
                      lagrange_second,  // column 1 - now: hiding op row
                      lagrange_third,   // column 2 - NEW: first real op
                      lagrange_last);   // column 3
```

And populate in `compute_polynomials`:
```cpp
lagrange_first.at(0) = 1;
lagrange_second.at(1) = 1;
lagrange_third.at(2) = 1;  // NEW
lagrange_last.at(unmasked_witness_size - 1) = 1;
```

### 5. Transcript Builder: Skip Native EC Computation for Index 0

**File:** `barretenberg/cpp/src/barretenberg/eccvm/transcript_builder.hpp`

The transcript builder performs native EC operations on `base_point` (line 392-394):

```cpp
static void process_mul(const ECCVMOperation& entry, VMState& updated_state, const VMState& state)
{
    const auto P = typename CycleGroup::element(entry.base_point);  // Would fail for non-curve point!
    const auto R = typename CycleGroup::element(state.msm_accumulator);
    updated_state.msm_accumulator = R + P * entry.mul_scalar_full;
}
```

**Modification:** In the main loop over `vm_operations` (line 178), skip native computation for index 0 (the hiding op):

```cpp
for (size_t i = 0; i < num_vm_entries; i++) {
    TranscriptRow& row = transcript_state[i + 1];
    const ECCVMOperation& entry = vm_operations[i];

    // Skip all EC computation for hiding op (index 0, becomes row 1)
    if (i == 0) {
        // Just record the raw field elements - no native EC ops
        row.base_x = entry.base_point.x;
        row.base_y = entry.base_point.y;
        row.z1 = 0;
        row.z2 = 0;
        row.opcode = 2;  // q_eq = 1
        // All other fields remain zero/default
        continue;
    }

    // ... existing code for real ops ...
}
```

### 6. ECCVM Circuit Builder: Exclude Index 0 from MSM

**File:** `barretenberg/cpp/src/barretenberg/eccvm/eccvm_circuit_builder.hpp`

The `get_msms()` method builds MSM data from eccvm ops. Since the hiding op has `q_eq = 1` (not `q_mul = 1`), it should already be excluded from `ecc_muls`. Verify the data flow.

### 7. Precomputed Tables Builder: Exclude Index 0

**File:** `barretenberg/cpp/src/barretenberg/eccvm/precomputed_tables_builder.hpp`

The precompute builder creates point tables `{-15P, ..., 15P}` for each scalar mul. Since `ecc_muls` only contains operations with `q_mul = 1`, and the hiding op has `q_eq = 1`, it should already be excluded. Verify the data flow.

---

## ECCVM Relation Modifications

### 8. Transcript Relation Updates

**File:** `barretenberg/cpp/src/barretenberg/relations/ecc_vm/ecc_transcript_relation_impl.hpp`

#### 8.1 On-Curve Check (Line 253)

Current:
```cpp
std::get<13>(accumulator) += validate_on_curve * on_curve_check * is_not_infinity * scaling_factor;
```

Modified - skip at hiding op row:
```cpp
auto is_not_hiding_row = (-lagrange_second + 1);  // 0 at row 1, 1 elsewhere
std::get<13>(accumulator) += validate_on_curve * on_curve_check * is_not_infinity * is_not_hiding_row * scaling_factor;
```

#### 8.2 Eq Constraints (Lines 227-230)

The `q_eq` constraints check that `(Px, Py) == accumulator`. These must be skipped for the hiding op:

Current:
```cpp
auto eq_x_diff_relation = q_eq * (eq_x_diff * both_not_infinity + infinity_exclusion_check);
auto eq_y_diff_relation = q_eq * (eq_y_diff * both_not_infinity + infinity_exclusion_check);
std::get<9>(accumulator) += eq_x_diff_relation * scaling_factor;
std::get<10>(accumulator) += eq_y_diff_relation * scaling_factor;
```

Modified:
```cpp
auto is_not_hiding_row = (-lagrange_second + 1);
auto eq_x_diff_relation = q_eq * (eq_x_diff * both_not_infinity + infinity_exclusion_check) * is_not_hiding_row;
auto eq_y_diff_relation = q_eq * (eq_y_diff * both_not_infinity + infinity_exclusion_check) * is_not_hiding_row;
std::get<9>(accumulator) += eq_x_diff_relation * scaling_factor;
std::get<10>(accumulator) += eq_y_diff_relation * scaling_factor;
```

#### 8.3 Enforce `q_eq = 1` at Row 1 (NEW)

Add new constraint to ensure prover sets correct opcode:
```cpp
// Enforce hiding op has q_eq = 1
std::get<N>(accumulator) += lagrange_second * (-transcript_eq + 1) * scaling_factor;
```

#### 8.4 Accumulator Empty Check (Line 241)

Current:
```cpp
std::get<11>(accumulator) += lagrange_second * (-is_accumulator_empty + 1) * scaling_factor;
```

Modified - use `lagrange_third` (first real op is now at row 2):
```cpp
std::get<11>(accumulator) += lagrange_third * (-is_accumulator_empty + 1) * scaling_factor;
```

#### 8.5 MSM Count Check (Line 242)

Current:
```cpp
std::get<12>(accumulator) += (lagrange_second * msm_count + lagrange_last * pc) * scaling_factor;
```

Modified - use `lagrange_third`:
```cpp
std::get<12>(accumulator) += (lagrange_third * msm_count + lagrange_last * pc) * scaling_factor;
```

#### 8.6 Point Counter (PC) Logic (Lines 134-138)

Current:
```cpp
auto num_muls_in_row = ((-z1_zero + 1) + (-z2_zero + 1)) * (-transcript_Pinfinity + 1);
std::get<3>(accumulator) += is_not_first_row * (pc_delta - q_mul * num_muls_in_row) * scaling_factor;
```

Since hiding op has `q_mul = 0`, the term `q_mul * num_muls_in_row = 0`, so no PC decrement occurs. **No change needed.**

#### 8.7 MSM Transition Logic (Lines 156-183)

Since hiding op has `q_mul = 0`, MSM transition logic doesn't trigger. **No change needed.**

#### 8.8 Lambda and Point Addition Logic (Lines 259-423)

All EC addition/doubling logic is gated by `q_add`, `msm_transition`, etc. Since hiding op has `q_add = 0` and `q_mul = 0`, these are skipped. **No change needed.**

### 9. Set Relation

**File:** `barretenberg/cpp/src/barretenberg/relations/ecc_vm/ecc_set_relation_impl.hpp`

The set relation links transcript rows to MSM/precompute tables via multiset equality.

Since hiding op has `transcript_mul = 0`:
- Skip function (line 46) may skip this row
- Grand product denominator term: `transcript_mul * transcript_product + (-transcript_mul + 1) = 1`, so no tuple is written

**No change needed.**

---

## Translator Modifications

### 10. No Changes Required

The Translator processes UltraOps as field elements without any on-curve validation:

- `x_lo`, `x_hi`, `y_lo`, `y_hi` are just field element decompositions
- Range constraints ensure they're valid field elements
- No curve equation check exists

The hiding op's random `Px`, `Py` will be processed normally, contributing to `accumulated_result`.

---

## Summary of Changes

| Component | File | Change |
|-----------|------|--------|
| Chonk | `chonk.cpp` | Move hiding op to tail kernel, use random field elements |
| MegaCircuitBuilder | `mega_circuit_builder.hpp/cpp` | Add `queue_ecc_hiding_op()` method |
| ECCOpQueue | `ecc_op_queue.hpp` | Push hiding op to both tables with `q_eq = 1` |
| ECCVMFlavor | `eccvm_flavor.hpp` | Add `lagrange_third` selector |
| TranscriptBuilder | `transcript_builder.hpp` | Skip native EC ops for index 0, record raw field elements |
| ECCVMCircuitBuilder | `eccvm_circuit_builder.hpp` | Likely no change (hiding op excluded by `q_mul = 0`) |
| PrecomputedTablesBuilder | `precomputed_tables_builder.hpp` | Likely no change (hiding op excluded by `q_mul = 0`) |
| TranscriptRelation | `ecc_transcript_relation_impl.hpp` | Gate on-curve check and eq constraints with `(1 - lagrange_second)`; enforce `q_eq = 1` at row 1; replace `lagrange_second` → `lagrange_third` for accumulator/msm_count checks |
| SetRelation | `ecc_set_relation_impl.hpp` | No change (already skips if `transcript_mul = 0`) |
| Translator | - | No changes required |

---

## Hiding Op Witness Values

For the hiding op at row 1 (`lagrange_second = 1`):

| Wire | Value | Rationale |
|------|-------|-----------|
| `transcript_Px` | Random Fq | Contributes to Px(x) evaluation |
| `transcript_Py` | Random Fq | Contributes to Py(x) evaluation |
| `transcript_z1` | 0 (or any 128-bit value) | Range-constrained in Translator; zero for simplicity |
| `transcript_z2` | 0 (or any 128-bit value) | Range-constrained in Translator; zero for simplicity |
| `transcript_op` | **2** | Opcode value for `q_eq = 1` |
| `transcript_add` | 0 | Not an add |
| `transcript_mul` | 0 | Not a mul (critical for set relation) |
| `transcript_eq` | **1** | Required so transcript builder records Px, Py |
| `transcript_base_infinity` | 0 | Point is "not infinity" (has coordinates) |
| `transcript_pc` | Same as row 2 | No PC decrement |
| `transcript_msm_count` | 0 | No MSM in progress |
| `transcript_accumulator_*` | Point at infinity | Accumulator empty |

### Why `q_eq = 1` (opcode = 2)?

The transcript builder zeros out `base_x`, `base_y` unless one of `add`, `mul`, or `eq` is set:
```cpp
row.base_x = ((entry.op_code.add || entry.op_code.mul || entry.op_code.eq) && !base_point_infinity)
                 ? entry.base_point.x : 0;
```

Using `q_eq = 1`:
- Preserves random `Px`, `Py` values (not zeroed)
- `transcript_mul = 0` → set relation skips this row (no precompute lookup)
- No PC decrement (only happens for `q_mul`)
- No MSM transition logic

### Selector Values

| Row | `lagrange_first` | `lagrange_second` | `lagrange_third` | `lagrange_last` |
|-----|------------------|-------------------|------------------|-----------------|
| 0 | 1 | 0 | 0 | 0 |
| 1 (hiding op) | 0 | 1 | 0 | 0 |
| 2 (first real op) | 0 | 0 | 1 | 0 |
| ... | 0 | 0 | 0 | 0 |
| N-1 | 0 | 0 | 0 | 1 |

---

## Security Analysis

### Before (Current)
- Randomness: ~128 bits (from scalar endomorphism decomposition)
- Hiding: Computational (DLOG hardness)

### After (Proposed)
- Randomness: ~508 bits (two independent ~254-bit field elements Px, Py)
- Hiding: Statistical (information-theoretic)

The verifier observes `Px(x)` and `Py(x)` which are linear combinations of all row values. With one row containing uniformly random field elements, the evaluations are statistically indistinguishable from random, regardless of computational assumptions.

---

## Testing Considerations

1. **Unit test:** Verify hiding op lands at row 1 in ECCVM transcript
2. **Unit test:** Verify on-curve check is skipped at `lagrange_second`
3. **Unit test:** Verify hiding op doesn't affect MSM/precompute builders
4. **Integration test:** Full Chonk proof with new hiding op verifies correctly
5. **Fuzzing:** Random Px, Py values don't break any constraints
