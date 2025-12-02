# Translator VM: Design Justification

## Context

This document analyzes whether the Translator VM (7 relation types, 139 subrelations) could be replaced with simpler bigfield-based computation.

**Conclusion: The Translator VM should be retained.** While bigfield offers significant code simplification (~400 lines vs ~7,000 lines), the optimized bigfield path is blocked by a fundamental obstruction (app-generated ops cannot be soundly range-constrained), and the standard bigfield path is 2x slower with 4x larger circuits.

## Critical Obstruction: App-Generated Ops

The optimized bigfield approach (2^18 circuit) relies on Px/Py coordinates being pre-decomposed into 68-bit limbs and range-constrained before reaching the translator. However, **apps can create ECC ops directly**, and these ops bypass kernels entirely.

### Why This Is Unsound

The `unsafe_construct_from_limbs` function trusts that limbs are valid 68-bit values. If an attacker provides malformed limbs (values exceeding 68 bits), they could break the accumulator computation. For soundness, every Px/Py coordinate must be range-constrained somewhere.

### Paths Considered and Rejected

| Approach | Obstruction |
|----------|-------------|
| **Pre-constrain in kernels** | Apps create ops outside kernels - kernels never see these ops |
| **Range-constrain per-op in op queue** | Would require significantly more complex ECC op queue relation logic and/or substantial gate overhead. Cannot use permutation argument due to Goblin delegation complexity. Feasibility and cost are difficult to assess. |
| **Delegate op polynomials to kernels** | Kernels must have **constant circuit structure** for IVC (fixed VK). Variable ops per kernel would break this. Also adds significant architectural complexity. |

### Implications

- The **optimized bigfield path (2^18) is not viable** for general use
- Only the **standard bigfield path (2^19)** with full range constraints is sound
- Standard bigfield is **2x slower** (2.6s vs 1.25s) and **4x larger** (2^19 vs 2^17) than Translator VM
- The code simplification benefits do not justify this performance regression

---

## Current Translator VM

| Property | Value |
|----------|-------|
| Circuit size | 2^17 (131,072 gates) |
| Architecture | 16 interleaved mini-circuits of 2^13 rows |
| Witness polynomials | 91 (most sparse, mini-circuit sized) |
| Peak memory | **264 MB** |
| Proving time (2000 ops) | **1,253 ms** |

Each row computes:
```
accumulator = prev_accumulator·x + op + P.x·v + P.y·v² + z1·v³ + z2·v⁴ mod p
```

## Alternative: Bigfield Approach

Use bigfield's `mult_madd` to compute column sums with vertical batching:
```
result = Σ(op_i·x^{N-1-i}) + v·Σ(px_i·x^{N-1-i}) + v²·Σ(py_i·x^{N-1-i}) + v³·Σ(z1_i·x^{N-1-i}) + v⁴·Σ(z2_i·x^{N-1-i})
```

### Baseline Bigfield (Standard Limbs)

Uses `fq_ct(x_lo, x_hi)` constructor which decomposes 136-bit limbs and adds range constraints.

| Property | Value |
|----------|-------|
| Circuit size | 2^19 (~324K gates) |
| Peak memory | 543 MB (LightZK) / 406 MB (MegaFlavor) |
| Proving time (2000 ops) | ~3,330 ms (LightZK) / ~2,610 ms (MegaFlavor) |

### Optimized Bigfield (Pre-decomposed Limbs)

Assumes Px/Py coordinates are pre-decomposed into 68-bit limbs and range-constrained in kernels. Uses `unsafe_construct_from_limbs` which skips decomposition and range constraints.

| Property | Value |
|----------|-------|
| Circuit size | **2^18** (~181K gates) |
| Peak memory | 353 MB (LightZK) / 406 MB (MegaFlavor) |
| Proving time (2000 ops) | 2,034 ms (LightZK) / **1,810 ms** (MegaFlavor) |

## Benchmark Comparison (2000 ops)

**Remote benchmark (16-core EC2):**

| Approach | Circuit Size | Proving Time | Relative |
|----------|--------------|--------------|----------|
| **Translator VM** | 2^17 | **1,253 ms** | 1.0x |
| Bigfield + MegaFlavor (optimized) | 2^18 | 1,810 ms | 1.44x |
| Bigfield + LightZK (optimized) | 2^18 | 2,034 ms | 1.62x |

**BB_BENCH=1 breakdown (local):**

| Component | Translator VM | Bigfield + LightZK | Bigfield + MegaFlavor |
|-----------|--------------|-------------------|----------------------|
| **Total Time** | 1,305 ms | 2,018 ms | 1,827 ms |
| **Peak Memory** | 264 MB | 353 MB | 406 MB |
| Circuit Construction | 114 ms | 345 ms | 341 ms |
| Commitments | 218 ms | 513 ms | 477 ms |
| Sumcheck | 113 ms | 165 ms | 140 ms |

## Why Bigfield Is Larger

### 1. Bigfield's NNF overhead is inherent (~82K gates)

Each bigfield multiplication requires Non-Native Field (NNF) gates. For 4096 ops with ~20K unique multiplications × 4 gates each = ~82K gates just for NNF. This alone exceeds half of Translator's total circuit size.

### 2. Translator's interleaving is a key optimization

Translator processes 16 mini-circuits of 2^13 rows, interleaved into 2^17 polynomials. Most witness polynomials only store mini-circuit-sized data. This sparse structure cannot be replicated with bigfield's single-pass approach.

### 3. Pre-decomposition only helps partially

Even with pre-decomposed Px/Py limbs (skipping ~143K gates of range constraints), the circuit is still 2^18 (~181K gates) - larger than Translator's 2^17.

## Bigfield Advantages (Insufficient to Justify Adoption)

The bigfield approach offers real benefits, but they do not outweigh the 2x performance and 4x circuit size regression:

1. **Simpler codebase**: ~400 lines vs ~7,000 lines (4,600 in translator_vm/ + 2,300 in relations/)
2. **Easier auditing**: Reuses standard bigfield primitives vs 7 custom relation types with 139 subrelations
3. **Smaller proof size**: LightZK produces 295 Fr fields vs Translator's 586 Fr fields (50% smaller)
4. **Smaller recursive verifier**: KZG verifier MSM is 58 points vs 119 points (2x smaller)
5. **Standard PCS flow**: No interleaving trick required

These benefits would matter if the optimized path (2^18) were viable, bringing performance closer to Translator VM. With only the standard path (2^19) available, the trade-off is unfavorable.

## Pre-decomposed Limbs: Implementation Details

> **Note**: This section documents the optimized approach for completeness. As explained in "Critical Obstruction" above, this path is **not viable** due to the inability to soundly range-constrain app-generated ops.

### Current Op Queue Layout (2 rows per op)

```
Row 2i:   (op,   x_lo,  x_hi,  y_lo)   // x_lo, x_hi, y_lo are 136-bit
Row 2i+1: (0,    y_hi,  z1,    z2)     // y_hi is 136-bit, z1/z2 are 128-bit
```

### Proposed Op Queue Layout (3 rows per op)

```
Row 3i:   (op,       x_lo_lo, x_lo_hi, x_hi_lo)  // 68-bit limbs
Row 3i+1: (x_hi_hi,  y_lo_lo, y_lo_hi, y_hi_lo)  // x_hi_hi 50-bit (top limb), rest 68-bit
Row 3i+2: (y_hi_hi,  z1,      z2,      0)        // y_hi_hi 50-bit (top limb), z1/z2 128-bit
```

Note: BN254 Fq is 254 bits. Split into 4 limbs: 68 + 68 + 68 + 50 = 254. The top limb (`x_hi_hi`, `y_hi_hi`) is only 50 bits.

### Kernel Overhead Analysis

Pre-decomposing Px/Py in kernels adds range constraint gates:

| Ops/Kernel | Gates/Op | Gates/Kernel |
|------------|----------|--------------|
| 240 (typical) | 36 | 8,640 |

With 17 kernels × 240 ops/kernel:
- Kernel overhead: 17 × 8,640 = **146,880 gates total** (distributed across kernels)
- Translator savings: ~143,000 gates (324K → 181K)
- **Net impact on total gates: roughly neutral**

However, kernel overhead is parallelizable across 17 provers, while translator savings speed up the single translator prover.

### Toggle Flag

The `compute_accumulator` function supports both modes:

```cpp
// Standard (default): full range constraints, 2^19 circuit
fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v);

// Optimized: assumes pre-decomposed limbs, 2^18 circuit
fq_ct result = BigfieldTranslator::compute_accumulator(builder, x, v, /*use_predecomposed_limbs=*/true);
```

---

## Appendix: Gate Count Breakdown

### Baseline Bigfield (4096 ops)

| Component | Gates |
|-----------|-------|
| ECC op block | 8,192 |
| Arithmetic | ~86,000 |
| NNF (queued) | ~81,000 |
| **Pre-finalize** | **~175,000** |
| NNF (finalized) | +82,000 |
| Delta range | +68,000 |
| **Post-finalize** | **~324,000** → 2^19 |

### Optimized Bigfield (4096 ops, pre-decomposed Px/Py)

| Component | Gates |
|-----------|-------|
| ECC op block | 8,192 |
| Arithmetic | ~62,000 |
| NNF (queued) | ~82,000 |
| **Pre-finalize** | **~102,000** |
| NNF (finalized) | +82,000 |
| Delta range | +29,000 |
| **Post-finalize** | **~181,000** → 2^18 |

### Range Constraint Breakdown (Baseline)

| Range | Variables | Source |
|-------|-----------|--------|
| 16383 (14-bit) | ~213,000 | 68-bit limb decomposition (5×14-bit sublimbs) |
| 4095 (12-bit) | ~37,000 | Partial limbs |
| 255 (8-bit) | ~9,000 | Small constraints |
| 15 (4-bit) | ~8,500 | Nibble constraints (4-bit op codes) |
| **Total** | **~270,000** | → ~68K delta_range gates |

### Range Constraint Breakdown (Optimized)

| Range | Variables | Source |
|-------|-----------|--------|
| 16383 (14-bit) | ~88,500 | z1/z2 decomposition only |
| 4095 (12-bit) | ~12,000 | Partial limbs |
| Other | ~14,000 | Small constraints |
| **Total** | **~115,000** | → ~29K delta_range gates |

---

## Final Decision

**The Translator VM is retained.**

| Criteria | Translator VM | Bigfield (Standard) | Bigfield (Optimized) |
|----------|---------------|---------------------|----------------------|
| Circuit size | 2^17 | 2^19 | 2^18 |
| Proving time | 1.25s | ~2.6s | ~1.8s |
| Peak memory | 264 MB | 406 MB | 353-406 MB |
| Code complexity | 7,000 lines | 400 lines | 400 lines |
| **Viable?** | ✅ Yes | ⚠️ 2x slower | ❌ Unsound |

The optimized bigfield path would have been competitive (~1.44x slower), but the app-generated ops obstruction makes it unsound. The standard bigfield path is too slow to justify the trade-off.

### Additional Consideration: Op Queue Scaling

Increasing transaction depth may require doubling the fixed op queue size (e.g., 2^12 → 2^13 ops). Translator VM is purpose-built for this computation and scales efficiently with increased capacity. Bigfield reuses the general-purpose Ultra circuit builder, which incurs overhead that compounds as the fixed size grows - widening the performance and memory gap further.
