# Translator vs Bigfield: Complexity Analysis

## Overview

Replace the Translator VM with bigfield-based computation. The key insight: op queue inputs are **sequentially built** by the merge protocol during kernel execution. By adding range constraints in `batch_mul` (single entrypoint), we can enable a much simpler "translator" computation using bigfield primitives.

---

## Current Translator Architecture

| Property | Value |
|----------|-------|
| Mini-circuit | 2^13 rows (2^12 actual ops, 2 rows per op) |
| Full circuit | **2^17 (131,072 gates)** |
| Relations | 7 types, 139 subrelations |

Each row computes:
```
accumulator = prev_accumulator·x + op + P.x·v + P.y·v² + z1·v³ + z2·v⁴ mod p
```

---

## Proposed: Bigfield with Vertical Batching

### Data Flow Change

```
Current:  Kernel (batch_mul) → OpQueue → Merge → ECCVM → Translator (2^17)
Proposed: Kernel (batch_mul + RANGE) → OpQueue → Merge → ECCVM → bigfield mult_madd
```

### Range Constraints in batch_mul (New)

**Current state**: Op queue members are **not** range-constrained in kernels today.

**Proposed**: Add range constraints in `batch_mul` - feasible because:
1. Single entrypoint for all op queue construction
2. Gate count overhead is acceptable (shared across kernel execution)

**For point coordinates (P.x, P.y)**: Use `bigfield(lo, hi)` constructor which:
- Decomposes 136-bit lo/hi into 4×68-bit limbs
- Automatically range-constrains all limbs

```cpp
fq_ct px(x_lo, x_hi);  // Automatically range-constrained
fq_ct py(y_lo, y_hi);
```

**For scalars (z1, z2)**: Use `cycle_scalar(lo, hi)` - range constraints come **free from batch_mul** algorithm (128-bit lo, 126-bit hi split).

### Vertical Batching Computation

Compute column sums independently using `mult_madd` with batch size 1024:

```
result = Σ(op_i·x^{N-1-i}) + v·Σ(px_i·x^{N-1-i}) + v²·Σ(py_i·x^{N-1-i}) + ...
```

Each column: `mult_madd(column_values, x_powers, {})` → 4 batches × 5 columns = 20 calls.

---

## x Power Computation: Batch Size Optimization

### Key Insight: Batch Size Tradeoff

The batch size creates a tradeoff:
- **Smaller batches** → fewer sequential powers, but more batch multipliers and more `mult_madd` calls
- **Larger batches** → more sequential powers, but fewer batch multipliers

### Measured Results (4096 rows)

| BATCH_SIZE | Sequential Powers | Batch Multipliers | Column Computation | **TOTAL** | **Log2** |
|------------|-------------------|-------------------|-------------------|-----------|----------|
| 16         | 515               | 33,008            | 124,358           | 157,881   | 17.27    |
| 32         | 995               | 14,674            | 82,045            | 97,714    | 16.58    |
| 64         | 1,955             | 6,452             | 61,845            | 70,252    | 16.10    |
| 128        | 3,875             | 2,806             | 51,290            | 57,971    | 15.82    |
| **256**    | **7,715**         | **1,208**         | **46,245**        | **55,168**| **15.75**|
| 512        | 15,395            | 514               | 43,645            | 59,554    | 15.86    |
| 1024       | 30,755            | 212               | 42,341            | 73,308    | 16.16    |

### Optimal: BATCH_SIZE = 256

| Component | Gates (measured) |
|-----------|------------------|
| 256 sequential powers (x^0..x^255) | 7,715 |
| Batch multipliers (16 batches) | 1,208 |
| Column computation (16 batches × 5 cols) | 46,245 |
| **Computation subtotal** | **55,168 (2^15.75)** |

### Limb Decomposition Overhead

The op queue stores values as 136-bit limbs (`x_lo`, `x_hi`), but bigfield uses 68-bit limbs internally.
Even with pre-constrained inputs, we must split each 136-bit limb into two 68-bit limbs and constrain the split.

| Component | Gates |
|-----------|-------|
| Limb decomposition (4096 rows × 5 cols × ~4 gates) | ~82,000 |
| Computation (powers + column sums) | ~55,000 |
| **Total** | **~137,000 (2^17.06)** |

### Why 256 is Optimal

1. **Sequential powers**: 255 multiplications × ~30 gates = 7,650 gates (matches measurement)
2. **Batch multipliers**: Need x^256, x^512, ..., x^{15×256} - computed via binary exponentiation
3. **Column computation**: 16 batches × 5 columns × (~520 gates per mult_madd + ~55 gates scaling) ≈ 46,000 gates

The sweet spot is where the decreasing batch multiplier cost intersects with increasing column computation cost.

---

## Comparison

| Approach | Circuit Size | Log2 | vs Translator |
|----------|-------------|------|---------------|
| Current Translator | 131,072 | 17.0 | baseline |
| **Bigfield (batch=256)** | **~137,000** | **17.06** | **similar size** |

**Note**: While the circuit size is similar, the main benefits are:
1. **Much simpler codebase** - eliminates 7 relation types, 139 subrelations
2. **Uses audited bigfield primitives** - less custom code to audit
3. **LightZK flavor** - fewer polynomials → smaller proof and less memory

---

## Flavor for Final Circuit

### Problem with MegaZK

MegaZK has `ecc_op_wires` for copy-constraining op queue inputs, but includes unnecessary overhead:

| Component | Polynomials | Notes |
|-----------|-------------|-------|
| Databus (calldata, return_data) | 12 | Not needed |
| Poseidon2 selectors | 2 | Not needed |
| **Total Mega entities** | **55** | Too heavy |

**Note**: Range constraints use `DeltaRangeConstraintRelation` (sorted permutation with D(D-1)(D-2)(D-3)=0 check), **not** log-derivative lookups. So no log-derivative overhead for bigfield range checks.

### Proposed: Lightweight ZK Flavor (No Lookups)

Bigfield uses `DeltaRangeConstraintRelation` for range checks (sorted permutation), **not** log-derivative lookups. So we can remove lookup machinery entirely.

**Precomputed (20 polys):**
- Selectors: q_m, q_c, q_l, q_r, q_o, q_4, q_arith, q_delta_range, q_elliptic, q_nnf (10)
- Permutation: sigma_1-4, id_1-4 (8)
- Lagrange: lagrange_first, lagrange_last (2)

**Witness (9 polys):**
- Wires: w_l, w_r, w_o, w_4 (4)
- Derived: z_perm (1)
- ECC op wires: ecc_op_wire_1-4 (4)


**Remove from Mega:**
- q_busread, q_lookup, q_memory, q_poseidon2_external, q_poseidon2_internal, databus_id, lagrange_last, lagrange_ecc_op (-8 precomputed)
- table_1-4 (-4 precomputed, no lookups needed)
- lookup_inverses, lookup_read_counts, lookup_read_tags (-3 witness)
- calldata/secondary_calldata/return_data + counts/tags/inverses (-12 witness)

**LightZK Total: 29 polys** (vs 55 in Mega)

### Memory Footprint

**Translator (measured): 247 MB peak**

Translator uses efficient sparse polynomial allocation:
- Full-size (2^17): interleaved (4), ordered_range_constraints (5), z_perm
- Mini-circuit (2^13): 80 wire polynomials, op, lagranges
- Many polynomials share virtual size but have small actual allocations

**LightZK with batch=256 (~137,000 gates → 2^18 dyadic):**
- Wires (w_l, w_r, w_o, w_4): 4 × 2^18 × 32B = 32 MB
- z_perm: 2^18 × 32B = 8 MB
- Precomputed selectors (20): 20 × 137,000 × 32B ≈ 85 MB (actual circuit size)
- ecc_op_wires (4, mini-circuit): 4 × 2^13 × 32B = 1 MB
- **Estimated: ~130 MB raw, ~180 MB peak with sumcheck**

| Approach | Circuit Size | Dyadic | Peak Memory | Notes |
|----------|-------------|--------|-------------|-------|
| **Translator** | 131,072 | 2^17 | **247 MB** | Measured, 88 witness polys |
| **LightZK Bigfield** | **~137,000** | **2^18** | **~180 MB** | **-27% memory**, 5 witness polys |

The memory savings come primarily from LightZK having far fewer witness polynomials (5 vs 88).

### Proof Size Benefit

**Prover commits to only 5 witness polys** (selectors in fixed VK, ecc_op_wires reused from merge):
- Wires: w_l, w_r, w_o, w_4 (4)
- z_perm (1)

**Chonk proof size reduction**: Translator currently has 88 witness commitments. LightZK reduces this to 5, significantly shrinking the final Chonk proof.

---

## Conclusion

| Approach | Recommendation |
|----------|----------------|
| **Bigfield with LightZK** | **Preferred: simpler code, -27% memory, smaller proofs** |

**Benefits of bigfield approach**:
1. **Eliminates 7 relation types, 139 subrelations** - much simpler codebase
2. **Uses audited bigfield primitives** - less custom code to audit
3. **LightZK flavor** - 5 witness polynomials vs 88
4. **~27% less memory** (~180 MB vs 247 MB)
5. **Smaller proof size** - 5 commitments vs 88

**Trade-off**: Circuit size is similar (~137K vs 131K gates, 2^18 vs 2^17 dyadic) due to limb decomposition overhead. The op queue's 136-bit limbs must be split into bigfield's 68-bit limbs.

**Optimal parameters**:
- `BATCH_SIZE = 256` (16 batches for 4096 rows)
- `MAXIMUM_SUMMAND_COUNT = 1024` in bigfield.hpp ✓ (allows batch sizes up to 1024)
