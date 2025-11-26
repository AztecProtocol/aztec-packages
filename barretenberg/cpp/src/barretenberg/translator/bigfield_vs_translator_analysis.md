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

## x Power Computation: Two Approaches

### Option A: Sequential (Safest)

Compute x^i = x^{i-1} · x directly in circuit.

| Component | Gates |
|-----------|-------|
| Power computation (N-1 mults) | 122,915 |
| Column computation | 41,741 |
| **Total** | **164,656 (2^17.33)** |

**Pro**: Simple, no soundness concerns
**Con**: Larger than current Translator

### Option B: RLC Batch Verification

Create powers as witnesses, batch-verify using Random Linear Combination:
- Compute A = Σ(r^i · x^i) and B = Σ(r^i · x^{i+1}) via `mult_madd`
- Verify A·x = B (single multiplication + equality check)

| Component | Gates |
|-----------|-------|
| Power witness creation | 32,768 |
| Power chain verification (RLC) | 45,425 |
| **Total power cost** | **78,193** |
| Column computation | 41,741 |
| **Total** | **119,934 (2^16.87)** |

**Pro**: 8% smaller than Translator
**Con**: Requires soundness analysis of RLC approach

---

## Comparison

| Approach | Circuit Size | Log2 | vs Translator |
|----------|-------------|------|---------------|
| Current Translator | 131,072 | 17.0 | baseline |
| **Bigfield + Sequential x** | 164,656 | 17.33 | +26% |
| **Bigfield + RLC x** | **119,934** | **16.87** | **-8%** |

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

**LightZK Sequential (2^17.33 → 2^18 dyadic):**
- Wires (w_l, w_r, w_o, w_4): 4 × 2^18 × 32B = 32 MB (full dyadic for masking)
- z_perm: 2^18 × 32B = 8 MB
- Precomputed selectors (20): 20 × 164,656 × 32B ≈ 100 MB (actual circuit size)
- ecc_op_wires (4, mini-circuit): 4 × 2^13 × 32B = 1 MB
- **Estimated: ~140 MB raw, ~210 MB peak with sumcheck**

**Memory island optimization**: LightZK witnesses have sparse structure:
```
[values @ 0..2^17.33] [zeros @ 2^17.33..2^18-4] [4 random masking rows]
```
Can use Polynomial memory islands to avoid allocating the zero gap:
- Wires: 4 × (164,656 + 4) × 32B ≈ 21 MB (vs 32 MB)
- z_perm: same savings
- **With islands: ~130 MB raw, ~195 MB peak**

**LightZK RLC (2^16.87 → 2^17 dyadic):**
- Same structure but half the size
- **Estimated: ~125 MB raw, ~190 MB peak**

| Approach | Circuit Size | Peak Memory | Notes |
|----------|-------------|-------------|-------|
| **Translator** | 2^17 | **247 MB** | Measured |
| **LightZK Sequential** | 2^18 | ~210 MB | -15%, simpler |
| **LightZK Sequential + Islands** | 2^18 | **~195 MB** | -21%, simpler |
| **LightZK RLC** | 2^17 | **~190 MB** | -23%, preferred |

Both LightZK options beat Translator on memory while dramatically simplifying the codebase.

### Proof Size Benefit

**Prover commits to only 5 witness polys** (selectors in fixed VK, ecc_op_wires reused from merge):
- Wires: w_l, w_r, w_o, w_4 (4)
- z_perm (1)

**Chonk proof size reduction**: Translator currently has 88 witness commitments. LightZK reduces this to 5, significantly shrinking the final Chonk proof.

---

## Conclusion

| Approach | Recommendation |
|----------|----------------|
| Sequential x powers | Safe fallback, but larger circuit |
| **RLC x powers** | **Preferred if soundness confirmed** |

**Benefits of bigfield approach**:
1. Eliminates 7 relation types, 139 subrelations
2. Uses audited bigfield primitives
3. Range constraints shared with kernel (no redundant work)
4. Simpler codebase

**Prerequisite**: `MAXIMUM_SUMMAND_COUNT = 1024` in bigfield.hpp ✓
