# Full-Randomness Hiding Op for Translator/ECCVM

## Problem Statement

Previously, the `accumulated_result` in Translator was masked using a valid on-curve point with a random scalar (`hide_op_queue_accumulation_result` in `chonk.cpp`). This provided only **~128 bits of randomness** because:

1. The scalar is split into two 128-bit endomorphism scalars `z1`, `z2`
2. The point must be on the BN254 curve (constrained by ECCVM's on-curve check)
3. Only the scalar contributes randomness to the batched evaluation


## Implemented Solution

A "Translator-valid" hiding op with fully random `Px`, `Py` field elements (~254 bits each) that:

1. Goes to **both** `ultra_ops_table` and `eccvm_ops_table`
2. Lands at a **fixed row** in ECCVM (row 1, identified by `lagrange_second`)
3. Is processed normally by **Translator** (which has no on-curve check)
4. Is **skipped** by ECCVM relations that would fail on non-curve points

### Result

The translation check `x · accumulated_result == op(x) + v·Px(x) + v²·Py(x) + v³·z1(x) + v⁴·z2(x) - masking_term` now includes contributions from fully random `Px`, `Py` field elements, providing **full statistical hiding** (~508 bits).

---

## Background: Architecture

### Translation Check

The ECCVM and Translator are linked via the translation check (see `translator_verifier.cpp`):

```
x · accumulated_result == Σᵢ Tᵢ(x) · vⁱ - masking_term
```

Where `Tᵢ` are the transcript polynomials `{op, Px, Py, z1, z2}` evaluated as **univariates** at challenge `x`.

### Key Insight

The univariate evaluation sums over **all rows** of the transcript polynomials. Even if a row doesn't perform actual EC computation, its `Px`, `Py` values still contribute to `Px(x)`, `Py(x)`.

---

## Implementation Details

### 1. Hiding Op Placement

The hiding op is added in the **tail kernel** (`HN_TAIL`), placed **after** the random non-ops:

```cpp
// In complete_kernel_circuit_logic(), for is_tail_kernel:
if (is_tail_kernel) {
    circuit.queue_ecc_no_op();              // Row 0: zeros for shiftability
    hide_op_queue_content_in_tail(circuit); // 3 random non-ops (Ultra-only)
    hide_op_queue_accumulation_result(circuit);  // Hiding op at row 1
}
```

**Why this works:** The random non-ops only go to `ultra_ops_table`, not `eccvm_ops_table`. So in ECCVM:
- Row 0: zeros (from no-op, for shiftability)
- Row 1: hiding op (`lagrange_second = 1`)
- Row 2+: actual ops from circuits

### 2. Hiding Op Implementation

**File:** `barretenberg/cpp/src/barretenberg/chonk/chonk.cpp`

```cpp
void Chonk::hide_op_queue_accumulation_result(ClientCircuit& circuit)
{
    using Fq = curve::Grumpkin::ScalarField; // Same as BN254::BaseField
    circuit.queue_ecc_hiding_op(Fq::random_element(), Fq::random_element());
}
```

### 3. Circuit Builder Method

**File:** `barretenberg/cpp/src/barretenberg/stdlib_circuit_builders/mega_circuit_builder.cpp`

```cpp
void MegaCircuitBuilder_<FF>::queue_ecc_hiding_op(const curve::BN254::BaseField& Px,
                                                  const curve::BN254::BaseField& Py)
{
    auto ultra_op = op_queue->append_hiding_op(Px, Py);
    (void)populate_ecc_op_wires(ultra_op);  // Add circuit gates
}
```

### 4. ECCOpQueue Method

**File:** `barretenberg/cpp/src/barretenberg/op_queue/ecc_op_queue.hpp`

The `append_hiding_op` method:
- Creates an `ECCVMOperation` with `q_eq = 1, q_reset = 1` (opcode = 3)
- Stores it for ECCVM prepending during reconstruction
- Pushes to `ultra_ops_table` through normal flow
- Returns the `UltraOp` for circuit gate creation

```cpp
UltraOp append_hiding_op(const Fq& Px, const Fq& Py)
{
    EccOpCode op_code{ .eq = true, .reset = true }; // opcode = 3
    // ... creates ECCVMOperation and UltraOp ...
    ultra_ops_table.push(ultra_op);
    return ultra_op;
}
```

### 5. Transcript Builder Handling

**File:** `barretenberg/cpp/src/barretenberg/eccvm/transcript_builder.hpp`

For the hiding op (index 0 in eccvm_ops), skip native EC computation and just record raw field elements:

```cpp
if (has_hiding_op && i == 0) {
    row.base_x = entry.base_point.x;
    row.base_y = entry.base_point.y;
    row.q_eq = entry.op_code.eq;
    row.q_reset_accumulator = entry.op_code.reset;
    row.opcode = entry.op_code.value();  // 3 = eq + reset
    row.pc = state.pc;
    // All other fields remain zero/default
    continue;
}
```

---

## ECCVM Relation Modifications

**File:** `barretenberg/cpp/src/barretenberg/relations/ecc_vm/ecc_transcript_relation_impl.hpp`

### Gated Constraints at Row 1

The following constraints are gated with `is_not_hiding_row = (-lagrange_second + 1)`:

1. **On-curve check** (subrelation 13):
```cpp
std::get<13>(accumulator) +=
    validate_on_curve * on_curve_check * is_not_infinity * is_not_hiding_row * scaling_factor;
```

2. **Eq constraints** (subrelations 9-10):
```cpp
auto eq_x_diff_relation = q_eq * (...) * is_not_hiding_row;
auto eq_y_diff_relation = q_eq * (...) * is_not_hiding_row;
```

### Boundary Conditions Moved to Row 2

The "first real op" boundary conditions now use `lagrange_third`:

```cpp
std::get<11>(accumulator) += lagrange_third * (-is_accumulator_empty + 1) * scaling_factor;
std::get<12>(accumulator) += (lagrange_third * msm_count + lagrange_last * pc) * scaling_factor;
```

### Opcode Constraints at Row 1

**New constraints** ensure the prover sets the correct opcode at the hiding row:

```cpp
// Enforce q_eq = 1 and q_reset = 1 at row 1
std::get<25>(accumulator) += lagrange_second * (-q_eq + 1) * scaling_factor;
std::get<26>(accumulator) += lagrange_second * (-q_reset_accumulator + 1) * scaling_factor;
```

---

## Soundness Analysis: Locality of Hiding Row

The hiding row (row 1) is **fully localized** - arbitrary values at row 1 cannot affect the validity of other rows.

### Constrained at Row 1

| Column | Value | Constraint |
|--------|-------|------------|
| `q_eq` | 1 | Subrelation 25 |
| `q_reset` | 1 | Subrelation 26 |
| `op` | 3 | Follows from opcode decomposition |
| `q_mul`, `q_add` | 0 | Mutual exclusion (subrelation 8) |
| `msm_count` | 0 | Subrelation 6: `(-q_mul + 1) * msm_count = 0` |

### Free at Row 1 (for hiding)

| Column | Purpose |
|--------|---------|
| `transcript_Px` | Random field element (~254 bits) |
| `transcript_Py` | Random field element (~254 bits) |
| `z1`, `z2` | Can be any value (only constrained if `z1_zero`/`z2_zero` = 1) |

### Propagation to Row 2

All shift relations properly reset state for row 2:

| Property | Constraint | Result |
|----------|------------|--------|
| `pc[2] = pc[1]` | Subrelation 3 (with `q_mul = 0`) | PC unchanged |
| `msm_count[2] = 0` | Subrelation 7 | MSM count stays 0 |
| `accumulator[2] = (0, 0)` | Subrelations 15-16 (with `q_reset = 1`) | Accumulator reset |
| `is_accumulator_empty[2] = 1` | Subrelation 22 (with `q_reset = 1`) | Empty flag set |

These match the boundary conditions enforced at row 2 (lagrange_third):
- `is_accumulator_empty = 1` (subrelation 11)
- `msm_count = 0` (subrelation 12)

### Other Relations Unaffected

The hiding row only affects `ecc_transcript_relation`. Other ECCVM relations are unaffected:

| Relation | Why Unaffected |
|----------|----------------|
| `ecc_msm_relation` | Only uses `lagrange_first`, hiding row has `q_mul = 0` |
| `ecc_set_relation` | Skips rows with `transcript_mul = 0` |
| `ecc_lookup_relation` | Only active during MSM computation |
| `ecc_point_table_relation` | Only active during MSM computation |
| `ecc_wnaf_relation` | Only active during MSM computation |
| `ecc_bools_relation` | Boolean constraints still apply (all booleans are 0 or 1) |

---

## Why Opcode 3 (eq + reset)?

The hiding op uses opcode 3 (`q_eq = 1, q_reset = 1`) for several reasons:

1. **Translator compatibility**: Only opcodes {0, 3, 4, 8} are valid in Translator
2. **Preserves Px, Py**: The transcript builder only records base point if `add`, `mul`, or `eq` is set
3. **Resets accumulator**: `q_reset = 1` ensures accumulator is (0,0) at row 2
4. **No MSM activity**: `q_mul = 0` means no MSM transition, no PC decrement, no precompute lookups

---

## Hiding Op Witness Values

For the hiding op at row 1 (`lagrange_second = 1`):

| Wire | Value | Rationale |
|------|-------|-----------|
| `transcript_Px` | Random Fq | Contributes to Px(x) evaluation |
| `transcript_Py` | Random Fq | Contributes to Py(x) evaluation |
| `transcript_z1` | 0 | Range-constrained in Translator; zero for simplicity |
| `transcript_z2` | 0 | Range-constrained in Translator; zero for simplicity |
| `transcript_op` | 3 | Opcode value for `q_eq = 1, q_reset = 1` |
| `transcript_add` | 0 | Not an add |
| `transcript_mul` | 0 | Not a mul (critical for set relation) |
| `transcript_eq` | 1 | Required for transcript builder to record Px, Py |
| `transcript_reset_accumulator` | 1 | Required to reset accumulator for row 2 |
| `transcript_base_infinity` | 0 | Point is "not infinity" (has coordinates) |
| `transcript_pc` | Same as row 2 | No PC decrement |
| `transcript_msm_count` | 0 | No MSM in progress |
| `transcript_accumulator_*` | (0, 0) | Accumulator reset by q_reset |

---

## Selector Layout

| Row | `lagrange_first` | `lagrange_second` | `lagrange_third` | `lagrange_last` |
|-----|------------------|-------------------|------------------|-----------------|
| 0 | 1 | 0 | 0 | 0 |
| 1 (hiding op) | 0 | 1 | 0 | 0 |
| 2 (first real op) | 0 | 0 | 1 | 0 |
| ... | 0 | 0 | 0 | 0 |
| N-1 | 0 | 0 | 0 | 1 |

---

## Security Analysis

### Before
- Randomness: ~128 bits (from scalar endomorphism decomposition)
- Hiding: Computational

### After
- Randomness: ~508 bits (two independent ~254-bit field elements Px, Py)
- Hiding: Statistical (information-theoretic)

---

## Files Modified

| Component | File | Change |
|-----------|------|--------|
| Chonk | `chonk.cpp` | Move hiding op to tail kernel, use `queue_ecc_hiding_op` |
| MegaCircuitBuilder | `mega_circuit_builder.hpp/cpp` | Add `queue_ecc_hiding_op()` method |
| ECCOpQueue | `ecc_op_queue.hpp` | Add `append_hiding_op()` returning UltraOp |
| ECCVMFlavor | `eccvm_flavor.hpp` | Add `lagrange_third` selector |
| TranscriptBuilder | `transcript_builder.hpp` | Handle hiding op at index 0 |
| TranscriptRelation | `ecc_transcript_relation.hpp` | Add subrelation for `q_reset = 1` constraint |
| TranscriptRelation | `ecc_transcript_relation_impl.hpp` | Gate on-curve/eq checks; enforce opcode; use `lagrange_third` |
| Goblin | `goblin.cpp` | Use `queue_ecc_hiding_op` for AVM mode |

---

## Tests

All existing tests pass, including:
- `ChonkTests.Basic` - Full Chonk proof with hiding op
- `ECCVMCircuitBuilderTests.*` - All ECCVM circuit builder tests
- `ECCVMTests.*` - All ECCVM prover/verifier tests
- `TranslatorTests.Basic` - Translator proof verification
