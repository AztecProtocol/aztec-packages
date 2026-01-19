# Pippenger Multi-Scalar Multiplication (MSM)

## Overview

The Pippenger algorithm computes multi-scalar multiplications:

$$\text{MSM}(\vec{s}, \vec{P}) = \sum_{i=0}^{n-1} s_i \cdot P_i$$

**Complexity**: $O(\frac{q}{c}(n + 2^c))$ group operations. With optimal $c \approx \frac{1}{2} \log_2 n$, this is roughly $O(n \cdot q / \log n)$, vs $O(n \cdot q)$ for naive scalar multiplication.

## Algorithm

### Step 1: Scalar Decomposition

**Implementation**: `get_scalar_slice(scalar, round_index, bits_per_slice)`

Each scalar $s_i$ is decomposed into $r$ slices of $c$ bits each, processed **MSB-first**:

$$s_i = \sum_{j=0}^{r-1} s_i^{(j)} \cdot 2^{c(r-1-j)}$$

- $c$ = bits per slice (from `get_optimal_log_num_buckets`, which brute-force searches for minimum cost)
- $r = \lceil \text{NUM\_BITS\_IN\_FIELD} / c \rceil$ = number of rounds
- Round 0 extracts the most significant bits

### Step 2: Bucket Accumulation

For each round $j$, points are added into **buckets** based on their scalar slice. Bucket $k$ accumulates all points whose slice value equals $k$:

$$B_k^{(j)} = \sum_{\{i : s_i^{(j)} = k\}} P_i$$

**Two implementation paths:**

- **Affine**: Sorts points by bucket and uses batched affine additions
- **Jacobian**: Direct bucket accumulation in Jacobian coordinates

### Step 3: Bucket Reduction

**Implementation**: `accumulate_buckets(bucket_accumulators)`

Computes weighted sum using a suffix sum (high to low):

$$R^{(j)} = \sum_{k=1}^{2^c - 1} k \cdot B_k^{(j)} = \sum_{k=1}^{2^c - 1} \left( \sum_{m=k}^{2^c - 1} B_m^{(j)} \right)$$

An offset generator is added and subtracted to avoid rare accumulator edge cases—a probabilistic mitigation that simplifies accumulation logic.

### Step 4: Round Combination

Combines all rounds using Horner's method (MSB-first):

```cpp
msm_accumulator = point_at_infinity
for j = 0 to r-1:
    repeat c doublings (or fewer for final round)
    msm_accumulator += bucket_result[j]
```

## Algorithm Variants

### Entry Points and Safety

| Entry Point | Default | Safety |
|-------------|---------|--------|
| `msm()` | `handle_edge_cases=false` | ⚠️ **Unsafe** |
| `pippenger()` | `handle_edge_cases=true` | ✓ Safe |
| `pippenger_unsafe()` | `handle_edge_cases=false` | ⚠️ Unsafe |
| `batch_multi_scalar_mul()` | `handle_edge_cases=true` | ✓ Safe |

### Edge Cases

Affine addition fails for **P = Q** (doubling), **P = −Q** (inverse), and **P = O** (identity). Jacobian coordinates handle these correctly at higher cost (~2-3× slower).

⚠️ **Use `msm()` or `pippenger_unsafe()` only when points are guaranteed linearly independent** (e.g., SRS points). For user-controlled or potentially duplicate points, use `pippenger()`.

### Affine Pippenger (`handle_edge_cases=false`)

Uses affine coordinates with Montgomery's batch inversion trick: replaces $m$ inversions with **1 inversion + O(m) multiplications**, yielding ~2-3× speedup over Jacobian.

### Jacobian Pippenger (`handle_edge_cases=true`)

Uses Jacobian coordinates for bucket accumulators. Handles all edge cases correctly.

## Tuning Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `PIPPENGER_THRESHOLD` | 16 | Below this, use naive scalar multiplication |
| `AFFINE_TRICK_THRESHOLD` | 128 | Below this, batch inversion overhead exceeds savings |
| `MAX_SLICE_BITS` | 20 | Upper bound on bucket count exponent |
| `BATCH_SIZE` | 2048 | Points per batch inversion (fits L2 cache) |
| `RADIX_BITS` | 8 | Bits per radix sort pass |

<details>
<summary>Cost model constants and derivations</summary>

| Constant | Value | Derivation |
|----------|-------|------------|
| `BUCKET_ACCUMULATION_COST` | 5 | 2 Jacobian adds/bucket × 2.5× cost ratio |
| `AFFINE_TRICK_SAVINGS_PER_OP` | 5 | ~10 muls saved − ~3 muls for product tree |
| `JACOBIAN_Z_NOT_ONE_PENALTY` | 5 | Extra field ops when Z ≠ 1 |
| `INVERSION_TABLE_COST` | 14 | 4-bit lookup table for modular exp |

**BATCH_SIZE=2048**: Each `AffineElement` is 64 bytes. 2048 points = 128 KB, fitting in L2 cache.

**RADIX_BITS=8**: 256 radix buckets × 4 bytes = 1 KB counting array, fits in L1 cache.

</details>

## Implementation Notes

### Zero Scalar Filtering

`transform_scalar_and_get_nonzero_scalar_indices` filters out zero scalars before processing (since $0 \cdot P_i = \mathcal{O}$). Scalars are converted from Montgomery form in-place to avoid doubling memory usage.

### Bucket Existence Tracking

A `BitVector` bitmap tracks which buckets are populated, avoiding expensive full-array clears between rounds. Clearing the bitmap costs $O(2^c / 64)$ words vs $O(2^c)$ for the full bucket array.

### Point Scheduling (Affine Variant Only)

Entries are packed as `(point_index << 32) | bucket_index` and sorted via **in-place MSD radix sort**. Sorting groups points by bucket, enabling efficient batch processing. The sort also detects entries with `bucket_index == 0` during the final radix pass, allowing zero-bucket entries to be skipped without a separate scan.

### Batched Affine Addition

`batch_accumulate_points_into_buckets` processes sorted points iteratively:
- Same-bucket pairs → queue for batch addition
- Different buckets → cache in bucket or queue with existing accumulator
- Uses branchless conditional moves to minimize pipeline stalls
- Prefetches future points to hide memory latency
- Recirculates results to maximize batch efficiency before writing to buckets

<details>
<summary>Batch accumulation case analysis</summary>

| Condition | Action | Iterator Update |
|-----------|--------|-----------------|
| `bucket[i] == bucket[i+1]` | Queue both points for batch add | `point_it += 2` |
| Different buckets, accumulator exists | Queue point + accumulator | `point_it += 1` |
| Different buckets, no accumulator | Cache point into bucket | `point_it += 1` |

After batch addition, results targeting the same bucket are paired again before writing to bucket accumulators, reducing random memory access by ~50%.

</details>

## Parallelization

Uses **per-thread buffers** (bucket accumulators, scratch space) to eliminate contention.

For `batch_multi_scalar_mul()`, work is distributed via `MSMWorkUnit` structures that can split a single MSM across multiple threads. Each thread computes partial results on point subsets, combined in a final reduction.

<details>
<summary>Thread-local buffer sizes</summary>

| Buffer | Size | Purpose |
|--------|------|---------|
| `BucketAccumulators` (affine) | $2^c × 64$ bytes | Affine bucket array + bitmap |
| `JacobianBucketAccumulators` | $2^c × 96$ bytes | Jacobian bucket array + bitmap |
| `AffineAdditionData` | ~400 KB | Scratch for batch inversion |
| `point_schedule` | $n × 8$ bytes | Per-MSM point schedule |

Memory scales with thread count. For 64 threads with $c = 15$: ~128 MB for bucket accumulators.

</details>

## File Structure

```
scalar_multiplication/
├── scalar_multiplication.hpp    # MSM class, data structures
├── scalar_multiplication.cpp    # Core algorithm
├── process_buckets.hpp/cpp      # Radix sort
├── bitvector.hpp                # Bit vector for bucket tracking
└── README.md                    # This file
```

## References

1. Pippenger, N. (1976). "On the evaluation of powers and related problems"
2. Bernstein, D.J. et al. "Faster batch forgery identification" (batch inversion)
