# Translator VM: Design Justification

## Context

This document analyzes whether the Translator VM (7 relation types, 139 subrelations) could be replaced with simpler bigfield-based computation. **Conclusion: No.** The Translator's complexity is justified by 3x better memory usage.

## Current Translator

| Property | Value |
|----------|-------|
| Circuit size | 2^17 (131,072 gates) |
| Architecture | 16 interleaved mini-circuits of 2^13 rows |
| Witness polynomials | 91 (most sparse, mini-circuit sized) |
| Peak memory | **247 MB** |

Each row computes:
```
accumulator = prev_accumulator·x + op + P.x·v + P.y·v² + z1·v³ + z2·v⁴ mod p
```

## Alternative Considered: Bigfield

Use bigfield's `mult_madd` to compute column sums with vertical batching:
```
result = Σ(op_i·x^{N-1-i}) + v·Σ(px_i·x^{N-1-i}) + v²·Σ(py_i·x^{N-1-i}) + v³·Σ(z1_i·x^{N-1-i}) + v⁴·Σ(z2_i·x^{N-1-i})
```

`BATCH_SIZE=256` minimizes gate count by balancing:
- Sequential power computation (x^0 to x^255)
- Batch multiplier overhead (x^256, x^512, ...)
- Column sum computation (16 batches × 5 columns)

### Batch Size Optimization Analysis

Tested batch sizes from 32 to 1024 to find optimal value:

| Batch Size | Sequential Powers | Batch Multipliers | Column Sums | Total (finalized) |
|------------|-------------------|-------------------|-------------|-------------------|
| 32         | 995               | 14,674            | 81,835      | 357,858           |
| 64         | 1,955             | 6,452             | 61,745      | 320,574           |
| 128        | 3,875             | 2,806             | 51,225      | 304,480           |
| **256**    | **7,715**         | **1,208**         | **46,195**  | **301,374**       |
| 512        | 15,395            | 514               | 43,595      | 308,838           |
| 1024       | 30,755            | 212               | 42,339      | 330,508           |

**Conclusion: BATCH_SIZE=256 is optimal** with 301,374 finalized gates.

The trade-off:
- Smaller batch → more batch multipliers (binary exponentiation overhead) + more mult_madd calls
- Larger batch → more sequential power multiplications (x^0 to x^{batch-1})

All batch sizes result in **2^19 dyadic size** - changing batch size cannot reduce circuit below 2^18.

## Gate Count Analysis (4096 op queue rows)

| Component | Gates | Notes |
|-----------|-------|-------|
| Limb decomposition | ~82,000 | 136-bit op queue limbs → 68-bit bigfield limbs |
| Power computation | ~7,700 | x^0 to x^255 sequentially |
| Batch multipliers | ~1,200 | x^256, x^512, ... via binary exp |
| Column sums | ~46,000 | 16 batches × 5 columns × ~580 gates |
| **Before finalization** | **~167,000** | |

### Finalization Overhead

Bigfield defers constraints to enable batching and deduplication:

| Deferred Operation | Gates Added | Mechanism |
|--------------------|-------------|-----------|
| NNF multiplications | ~67,000 | 20K cached → 17K unique after dedup → 4 gates each |
| Range constraints | ~67,000 | 268K variables sorted → delta_range (4 vars/gate) |
| **Total finalization** | **~134,000** | |

**After finalization: ~301,000 gates → 2^19 dyadic size**

## Memory Comparison

| Approach | Dyadic Size | Witness Polys | Peak Memory |
|----------|-------------|---------------|-------------|
| **Translator VM** | 2^17 | 91 (sparse) | **247 MB** |
| **Bigfield + MegaZK** | 2^19 | 25 | 1,090 MB |
| **Bigfield + LightZK** | 2^19 | 9 | **717 MB** |

LightZK is a minimal flavor with only arithmetic, permutation, delta_range, elliptic, NNF, and ECC op queue relations (no lookups, databus, poseidon2, memory).

**Result: Bigfield approach uses 2.9x more memory than Translator**

## Why The Gap Cannot Be Closed

### 1. Pre-finalization gates already exceed 2^17

Even before finalization adds ~134K gates, the circuit has ~167K gates. This already exceeds Translator's 2^17 = 131K ceiling. Eliminating all deferred constraints would still yield 2^18 dyadic size (2x worse).

### 2. Translator's interleaving is the key optimization

Translator processes 16 mini-circuits of 2^13 rows, interleaved into 2^17 polynomials. Most witness polynomials only store mini-circuit-sized data. This sparse structure cannot be replicated with bigfield's single-pass approach.

### 3. Bigfield's overhead is inherent

Each bigfield operation requires:
- Limb decomposition (136-bit → 4×68-bit)
- Range constraints on sublimbs (5×14-bit per 68-bit limb)
- NNF gates for non-native multiplication

This is the cost of general-purpose non-native field arithmetic.

### 4. Range-constraining op queue in kernels doesn't help

One idea: range-constrain op queue limbs in each kernel (at `batch_mul`) to avoid doing it in the translator circuit. This fails because:

- **Finalization overhead in kernels**: Each kernel's circuit finalization would add delta_range gates for the range constraints. The overhead is not amortized—it's paid in every kernel.
- **Commitment mismatch**: The op queue uses 136-bit limb representation (`x_lo`, `x_hi`), but bigfield internally uses 68-bit limbs. The merge protocol's commitment consistency check verifies that `ecc_op_wire` commitments match the accumulated op queue. Bigfield's different limb representation would break this check.

## Conclusion

**Keep the existing Translator VM.**

| Factor | Translator | Bigfield |
|--------|------------|----------|
| Memory | 247 MB | 717 MB |
| Code complexity | High (custom relations) | Low (reuses bigfield) |
| Auditability | Harder | Easier |

The Translator's complexity is justified by 3x better memory usage. This gap is architectural and cannot be bridged with incremental optimizations. Memory is the primary constraint in client-side proving.

---

## Appendix: Finalization Details

### NNF Multiplication Caching

Bigfield caches partial NNF multiplications during circuit construction via `queue_partial_non_native_field_multiplication`. At finalization:

1. Variable indices are resolved to real indices
2. Duplicates are removed (biggroup operations often produce identical mults)
3. 4 NNF gates are created per unique multiplication

```
Cached: 20,403 → After dedup: ~16,700 → Gates: ~66,800
```

### Range Constraint Batching

All range constraints are collected in `range_lists` keyed by target range:

| Range | Variables | Source |
|-------|-----------|--------|
| 16383 (14-bit) | 212,837 | 68-bit limb decomposition (5×14-bit sublimbs) |
| 4095 (12-bit) | 36,947 | Partial limbs |
| 255 (8-bit) | 8,821 | Small constraints |
| 15 (4-bit) | 8,201 | Nibble constraints |
| **Total** | **268,079** | |

At finalization, variables are sorted by value and verified via delta_range gates. The relation checks `D(D-1)(D-2)(D-3)=0` where D is the difference between adjacent sorted values, ensuring all values are in [0, target_range].

```
Gates: 268,079 / 4 ≈ 67,000
```
