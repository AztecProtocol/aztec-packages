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
| ECC op block | 8,192 | 4096 UltraOps × 2 rows each |
| Arithmetic (pre-finalize) | ~86,000 | Limb decomposition, powers, column sums |
| NNF (pre-finalize) | ~81,000 | Queued NNF multiplications |
| **Before finalization** | **~175,000** | Including ecc_op block |

### Finalization Overhead

Bigfield defers constraints to enable batching and deduplication:

| Deferred Operation | Gates Added | Mechanism |
|--------------------|-------------|-----------|
| NNF multiplications | ~82,000 | ~20K unique multiplications × 4 gates each |
| Range constraints | ~68,000 | ~270K variables sorted → delta_range (4 vars/gate) |
| **Total finalization** | **~150,000** | |

**After finalization: ~324,000 gates → 2^19 dyadic size**

## Memory Comparison

| Approach | Dyadic Size | Witness Polys | Peak Memory |
|----------|-------------|---------------|-------------|
| **Translator VM** | 2^17 | 91 (sparse) | **247 MB** |
| **Bigfield + MegaZK** | 2^19 | 25 | 1,090 MB |
| **Bigfield + LightZK** | 2^19 | 9+1 | **543 MB** (measured, builder freed) |
| **Bigfield + LightZK (greedy)** | 2^19 | 9+1 | **~360 MB** (estimated) |

LightZK is a minimal flavor with only arithmetic, permutation, delta_range, NNF, and ECC op queue relations (no lookups, databus, poseidon2, memory, elliptic). The "+1" is the gemini_masking_poly for ZK.

**Result: Bigfield approach uses ~1.5x more memory than Translator (with greedy allocation)**

## Proving Time Comparison

Benchmarks run on 16-core EC2 instance (idle system, 3 repetitions):

| Approach | Proving Time | Relative |
|----------|--------------|----------|
| **Translator VM** | ~1,230 ms | 1.0x (baseline) |
| **Bigfield + MegaFlavor** | ~2,610 ms | 2.1x slower |
| **Bigfield + LightZKFlavor** | ~3,330 ms | 2.7x slower |


### Breakdown (BB_BENCH=1, 4096 ops)

| Component | LightZK | MegaFlavor | Notes |
|-----------|---------|------------|-------|
| **Circuit construction** | 370 ms | 370 ms | Identical (same circuit) |
| **ProverInstance creation** | 348 ms | 344 ms | Similar (polynomial allocation + trace) |
| **OinkProver (commitments)** | 814 ms | 552 ms | Mega 32% faster (no ZK overhead) |
| **Sumcheck** | 392 ms | 274 ms | Mega 30% faster (fewer relations) |
| **Total commitments** | 1,320 ms | 1,020 ms | Mega 23% faster |

The proving time difference comes from:
1. **Circuit size**: 2^19 (bigfield) vs 2^17 (Translator) = 4x more rows
2. **Commitment cost**: Dominates proving time; scales with polynomial size
3. **ZK overhead**: LightZK adds masking polynomial and related computation

### LightZK with Greedy Allocation

By shifting ZK masking to positions ~325K (right after the trace) instead of the end of the 2^19 dyadic domain, we can allocate polynomials greedily:

| Polynomial Category | Count | Current Size | Greedy Size | Savings |
|--------------------|-------|--------------|-------------|---------|
| Non-gate selectors (q_m, q_c, q_l, q_r, q_o, q_4) | 6 | 524K | 325K | 38% |
| Wires (w_l, w_r, w_o, w_4) | 4 | 524K | 325K | 38% |
| z_perm | 1 | 524K | 325K | 38% |
| Sigmas/IDs | 8 | 325K | 325K | 0% |
| Gate selectors | 3 | block-sized | block-sized | 0% |
| ECC op wires + lagrange_ecc_op | 5 | 8K | 8K | 0% |
| lagrange_first, lagrange_last | 2 | 1 elem | 1 elem | 0% |

**Detailed Memory Breakdown (4096 ops, trace_size ≈ 325K, dyadic = 524K):**

```
CURRENT LightZK (masking at end of 2^19):
-----------------------------------------
Precomputed (20 polys):
  - Non-gate selectors: 6 × 524K × 32B = 100.7 MB  (full dyadic size)
  - Gate selectors:     3 × block_size × 32B ≈ 5 MB (sparse, ~50K total)
  - Sigmas (4):         4 × 325K × 32B =  41.6 MB  (trace_size)
  - IDs (4):            4 × 325K × 32B =  41.6 MB  (trace_size)
  - lagrange_first/last: 2 × 1 × 32B  ≈  0 MB     (single element each)
  - lagrange_ecc_op:    1 × 8K × 32B  =   0.3 MB  (ecc_op block size)
  Subtotal: 189.2 MB

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

TOTAL PROVER POLYNOMIALS: ~291 MB
PEAK MEMORY (measured, builder freed): 543 MB

GREEDY LightZK (masking at ~325K):
----------------------------------
Precomputed (20 polys):
  - Non-gate selectors: 6 × 325K × 32B = 62.4 MB  (saved 38.3 MB)
  - Gate selectors:     3 × block_size × 32B ≈ 5 MB
  - Sigmas + IDs:       8 × 325K × 32B = 83.2 MB  (unchanged)
  - Lagranges:          ≈ 0.3 MB                  (unchanged)
  Subtotal: 150.9 MB (saved 38.3 MB)

Witness (9 polys):
  - Wires (4):          4 × 325K × 32B = 41.6 MB  (saved 25.5 MB)
  - z_perm:             1 × 325K × 32B = 10.4 MB  (saved 6.4 MB)
  - ECC op wires (4):   4 × 8K × 32B   =  1.0 MB  (unchanged)
  Subtotal: 53.0 MB (saved 31.9 MB)

Masking (1 poly):
  - gemini_masking_poly: 1 × 325K × 32B = 10.4 MB  (saved 6.4 MB)

Commitment key (SRS): unchanged at 34 MB (still need full 2^19 SRS)

Partially evaluated multivariates (peak at sumcheck round 1):
  - 35 polys × 163K × 32B = 183 MB  (NUM_ALL_ENTITIES at trace_size/2)

TOTAL PROVER POLYNOMIALS: ~214 MB
PEAK MEMORY (estimated): ~360 MB

SAVINGS FROM GREEDY: ~183 MB (34% reduction in peak memory)
```

The greedy allocation requires:
1. Shifting ZK masking to indices ~325K instead of 524K-4
2. Modifying the row disabling polynomial for sumcheck to match
3. Ensuring the prover and verifier agree on the disabled row indices
4. Allocating non-gate selectors at trace_size instead of dyadic_size

## Why The Gap Cannot Be Closed

### 1. Pre-finalization gates already exceed 2^17

Even before finalization adds ~150K gates, the circuit has ~175K gates. This already exceeds Translator's 2^17 = 131K ceiling. Eliminating all deferred constraints would still yield 2^18 dyadic size (2x worse).

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

**Bigfield + Greedy LightZK is a viable replacement for the Translator VM.**

| Factor | Translator | Bigfield + LightZK | Bigfield + Greedy LightZK |
|--------|------------|-------------------|---------------------------|
| Memory | 247 MB | 543 MB | ~360 MB (estimated) |
| Code complexity | High (custom relations) | Low (reuses bigfield) | Low (reuses bigfield) |
| Auditability | Harder | Easier | Easier |

The Bigfield approach trades ~46% more memory for significantly simpler code that reuses existing bigfield primitives. This trade-off is acceptable because:

1. **Tolerable memory overhead**: 360 MB vs 247 MB (~113 MB difference) is modest in absolute terms
2. **Scales reasonably**: Even with 2x op queue size (8192 ops), the bigfield approach remains practical at ~720 MB estimated
3. **Simpler codebase**: Eliminates 7 custom relation types and 139 subrelations in favor of standard bigfield operations
4. **Easier auditing**: The bigfield approach requires auditing:
   - ~400 lines of circuit creation logic (bigfield_translator.cpp/hpp)
   - One new bigfield method to create from a single 136-bit limb
   - Row disabling polynomial for ZK sumcheck (modular, mostly prover-side; verifier only computes the disabling polynomial evaluation)

   Compare to Translator VM's ~7,000 lines (4,600 in translator_vm/ + 2,300 in relations/translator_vm/)
5. **Simpler PCS**: No interleaving trick required; standard Honk PCS flow
6. **Better ZK properties**:
   - Accumulated result can be a full 254-bit random scalar (vs constrained values in Translator)
   - No special masking tail handling needed in ECCVM since bigfield circuit operates on random Fr elements
7. **Smaller proof size**: LightZK produces 295 Fr fields vs Translator's 586 Fr fields (50% smaller)
   - LightZK: 9 witness commitments, 35 sumcheck evaluations, 19 rounds
   - Translator: 88 witness commitments, 188 sumcheck evaluations, 17 rounds
   - Fewer witness polynomials outweighs 2 extra sumcheck rounds
8. **Recursive verifier circuit**: Significantly smaller due to ~2x smaller MSM
   - KZG verifier MSM: LightZK **58 points** vs Translator **119 points** (measured)
   - MSM dominates recursive verifier cost; 2x fewer points ≈ 2x fewer biggroup scalar muls
   - Note: LightZKRecursiveFlavor not yet implemented; estimate based on MSM size reduction

---

## Appendix: Finalization Details

### NNF Multiplication Caching

Bigfield caches partial NNF multiplications during circuit construction via `queue_partial_non_native_field_multiplication`. At finalization:

1. Variable indices are resolved to real indices
2. Duplicates are removed (biggroup operations often produce identical mults)
3. 4 NNF gates are created per unique multiplication

```
Cached: ~20,400 → After dedup: ~20,400 → Gates: ~81,600
```

Note: In the bigfield translator circuit, deduplication has minimal effect because each row's bigfield operations use unique witness indices from the ecc_op block.

### Range Constraint Batching

All range constraints are collected in `range_lists` keyed by target range:

| Range | Variables | Source |
|-------|-----------|--------|
| 16383 (14-bit) | ~213,000 | 68-bit limb decomposition (5×14-bit sublimbs) |
| 4095 (12-bit) | ~37,000 | Partial limbs |
| 255 (8-bit) | ~9,000 | Small constraints |
| 15 (4-bit) | ~8,500 | Nibble constraints (4-bit op codes) |
| **Total** | **~270,000** | |

At finalization, variables are sorted by value and verified via delta_range gates. The relation checks `D(D-1)(D-2)(D-3)=0` where D is the difference between adjacent sorted values, ensuring all values are in [0, target_range].

```
Gates: ~270,000 / 4 ≈ 68,000
```
