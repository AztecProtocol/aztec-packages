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
| **Bigfield + LightZK** | 2^19 | 9+1 | **543 MB** (measured, builder freed) |
| **Bigfield + LightZK (greedy)** | 2^19 | 9+1 | **~340 MB** (estimated) |

LightZK is a minimal flavor with only arithmetic, permutation, delta_range, NNF, and ECC op queue relations (no lookups, databus, poseidon2, memory, elliptic). The "+1" is the gemini_masking_poly for ZK.

**Result: Bigfield approach uses ~1.3x more memory than Translator (with greedy allocation)**

### LightZK with Greedy Allocation

By shifting ZK masking to positions ~310K (right after the trace) instead of the end of the 2^19 dyadic domain, we can allocate polynomials greedily:

| Polynomial Category | Count | Current Size | Greedy Size | Savings |
|--------------------|-------|--------------|-------------|---------|
| Non-gate selectors (q_m, q_c, q_l, q_r, q_o, q_4) | 6 | 524K | 310K | 41% |
| Wires (w_l, w_r, w_o, w_4) | 4 | 524K | 310K | 41% |
| z_perm | 1 | 524K | 310K | 41% |
| Sigmas/IDs | 8 | 310K | 310K | 0% |
| Gate selectors | 3 | block-sized | block-sized | 0% |
| ECC op wires + lagrange_ecc_op | 5 | 8K | 8K | 0% |
| lagrange_first, lagrange_last | 2 | 1 elem | 1 elem | 0% |

**Detailed Memory Breakdown (4096 ops, trace_size ≈ 310K, dyadic = 524K):**

```
CURRENT LightZK (masking at end of 2^19):
-----------------------------------------
Precomputed (20 polys):
  - Non-gate selectors: 6 × 524K × 32B = 100.7 MB  (full dyadic size)
  - Gate selectors:     3 × block_size × 32B ≈ 5 MB (sparse, ~50K total)
  - Sigmas (4):         4 × 310K × 32B =  39.7 MB  (trace_size)
  - IDs (4):            4 × 310K × 32B =  39.7 MB  (trace_size)
  - lagrange_first/last: 2 × 1 × 32B  ≈  0 MB     (single element each)
  - lagrange_ecc_op:    1 × 8K × 32B  =   0.3 MB  (ecc_op block size)
  Subtotal: 185.4 MB

Witness (9 polys):
  - Wires (4):          4 × 524K × 32B = 67.1 MB  (full dyadic for ZK)
  - z_perm:             1 × 524K × 32B = 16.8 MB  (full dyadic for ZK)
  - ECC op wires (4):   4 × 8K × 32B   =  1.0 MB  (ecc_op block size)
  Subtotal: 84.9 MB

Masking (1 poly):
  - gemini_masking_poly: 1 × 524K × 32B = 16.8 MB  (full dyadic for Gemini ZK)

Commitment key (SRS): 524K × 64B = 34 MB  (G1 affine points)

Partially evaluated multivariates (peak at sumcheck round 1):
  - 35 polys × 262K × 32B = 294 MB  (NUM_ALL_ENTITIES at dyadic/2)

TOTAL PROVER POLYNOMIALS: ~287 MB
PEAK MEMORY (measured, builder freed): 543 MB

GREEDY LightZK (masking at ~310K):
----------------------------------
Precomputed (20 polys):
  - Non-gate selectors: 6 × 310K × 32B = 59.5 MB  (saved 41.2 MB)
  - Gate selectors:     3 × block_size × 32B ≈ 5 MB
  - Sigmas + IDs:       8 × 310K × 32B = 79.4 MB  (unchanged)
  - Lagranges:          ≈ 0.3 MB                  (unchanged)
  Subtotal: 144.2 MB (saved 41.2 MB)

Witness (9 polys):
  - Wires (4):          4 × 310K × 32B = 39.7 MB  (saved 27.4 MB)
  - z_perm:             1 × 310K × 32B =  9.9 MB  (saved 6.9 MB)
  - ECC op wires (4):   4 × 8K × 32B   =  1.0 MB  (unchanged)
  Subtotal: 50.6 MB (saved 34.3 MB)

Masking (1 poly):
  - gemini_masking_poly: 1 × 310K × 32B =  9.9 MB  (saved 6.9 MB)

Commitment key (SRS): unchanged at 34 MB (still need full 2^19 SRS)

Partially evaluated multivariates (peak at sumcheck round 1):
  - 35 polys × 155K × 32B = 174 MB  (NUM_ALL_ENTITIES at trace_size/2)

TOTAL PROVER POLYNOMIALS: ~195 MB
PEAK MEMORY (estimated): ~340 MB

SAVINGS FROM GREEDY: ~203 MB (37% reduction in peak memory)
```

The greedy allocation requires:
1. Shifting ZK masking to indices ~310K instead of 524K-4
2. Modifying the row disabling polynomial for sumcheck to match
3. Ensuring the prover and verifier agree on the disabled row indices
4. Allocating non-gate selectors at trace_size instead of dyadic_size

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
