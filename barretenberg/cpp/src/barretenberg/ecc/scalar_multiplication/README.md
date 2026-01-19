# Pippenger Multi-Scalar Multiplication (MSM)

This document describes the Pippenger MSM implementation in barretenberg.

## Overview

The Pippenger algorithm computes multi-scalar multiplications (MSMs):

$$\text{MSM}(\vec{s}, \vec{P}) = \sum_{i=0}^{n-1} s_i \cdot P_i$$

where $s_i$ are scalars and $P_i$ are elliptic curve points.

**Complexity**: For $n$ points with $q$-bit scalars and $c$-bit slices, the cost is approximately:

$$O\left(\frac{q}{c} \cdot (n + 2^c)\right) \text{ group operations}$$

With $c$ chosen by the implementation's cost model (typically on the order of $\log n$), this reduces to roughly $O(n \cdot q / \log n)$, compared to $O(n \cdot q)$ for naive scalar multiplication.

## Algorithm

### Terminology

**Bucket**: An accumulator (elliptic curve point) that collects all input points whose scalar slice equals a particular value. For $c$-bit slices, there are $2^c$ buckets indexed $0, 1, \ldots, 2^c - 1$. Bucket $k$ accumulates the sum of all points $P_i$ where the scalar slice $s_i^{(j)} = k$.

### Step 1: Scalar Decomposition

**Implementation**: `get_scalar_slice(scalar, round_index, bits_per_slice)`

Each NUM_BITS_IN_FIELD-bit scalar $s_i$ is decomposed into $r$ slices of $c$ bits each, processed **MSB-first**:

$$s_i = \sum_{j=0}^{r-1} s_i^{(j)} \cdot 2^{c(r-1-j)}$$

where:
- $c$ is the bits per slice (from `get_optimal_log_num_buckets`)
- $r = \lceil NUM_BITS_IN_FIELD / c \rceil$ is the number of rounds (from `get_num_rounds`)
- $s_i^{(j)} \in [0, 2^c - 1]$ is the slice value, which becomes the bucket index
- **Round 0 extracts the most significant bits**; round $r-1$ extracts the least significant bits

#### Optimal Bucket Count Selection

The choice of $c$ (bits per slice) minimizes total group operations. Let $B = 2^c$ be the number of buckets.

**Cost model** used by the implementation:

$$\text{cost}(c) = \text{rounds} \cdot (n + B \cdot \text{BUCKET\_ACCUMULATION\_COST})$$

where $\text{rounds} = \lceil NUM_BITS_IN_FIELD / c \rceil$ and $\text{BUCKET\_ACCUMULATION\_COST} = 5$.

**Implementation**: `get_optimal_log_num_buckets(num_points)` performs a **bounded brute-force search** over slice sizes from 2 to `MAX_SLICE_BITS` (20), selecting the $c$ that minimizes the cost model. This is more accurate than closed-form approximations because it accounts for the discrete nature of rounds and the bucket reduction overhead.

**Intuition**: The classic Pippenger heuristic suggests $c \approx \frac{1}{2}\log_2(n)$, but the actual implementation uses empirical cost modeling rather than this formula.

### Step 2: Bucket Accumulation

For each round $j$, points are added into buckets based on their scalar slice value:

$$B_k^{(j)} = \sum_{\{i : s_i^{(j)} = k\}} P_i$$

Each bucket $B_k$ accumulates the sum of all points whose scalar has slice value $k$ in round $j$.

**Two implementation paths:**

- **Affine variant** (`affine_pippenger_with_transformed_scalars`): Builds a point schedule (array of `(point_index, bucket_index)` pairs), radix-sorts by bucket, then calls `batch_accumulate_points_into_buckets()` to perform batched affine additions with Montgomery's trick.

- **Jacobian variant** (`jacobian_pippenger_with_transformed_scalars`): Directly loops over `scalar_indices` and adds each point to its target bucket using Jacobian addition. No sorting or scheduling required—simpler but slower.

### Step 3: Bucket Reduction

**Implementation**: `accumulate_buckets(bucket_accumulators)`

The round result requires computing a weighted sum of buckets:

$$R^{(j)} = \sum_{k=1}^{2^c - 1} k \cdot B_k^{(j)}$$

This is evaluated efficiently using a **running sum from high to low** (avoiding $k$ repeated additions per bucket):

$$R^{(j)} = \sum_{k=1}^{2^c - 1} \underbrace{\left( \sum_{m=k}^{2^c - 1} B_m^{(j)} \right)}_{\text{suffix sum}}$$

**Algorithm** (from `accumulate_buckets` template in scalar_multiplication.hpp):
```cpp
running_sum = buckets[highest_nonempty]
result = running_sum + offset_generator  // offset mitigates edge cases
for k = highest_nonempty - 1 down to 1:
    if bucket[k] exists:
        running_sum += bucket[k]
    result += running_sum
return result - offset_generator
```

Note: This is effectively a **suffix sum** (iterating from high indices to low), not a traditional prefix sum.

#### Why the Offset Generator?

The offset generator $G_{\text{off}}$ mitigates edge cases during the bucket reduction:

**Problem**: Some optimized addition paths have exceptional cases (e.g., when adding a point to itself, or when intermediate results land on special values). While `Element::operator+` generally handles these correctly, the offset provides defense-in-depth.

**Solution**: Adding a fixed offset $G_{\text{off}}$ at the start makes it statistically unlikely that `running_sum` equals `result` or its negation during accumulation. The offset is subtracted at the end:

$$R = \left( \sum_k \text{running\_sum}_k + G_{\text{off}} \right) - G_{\text{off}} = \sum_k \text{running\_sum}_k$$

**Implementation**: `get_offset_generator()` returns a deterministically-derived point that is statistically independent of the input points.

**Security note**: This is a **probabilistic** mitigation, not an algebraic guarantee. The offset generator is chosen to be linearly independent of typical bucket values with overwhelming probability. Both affine and Jacobian variants use this offset.

### Step 4: Round Combination

**Implementation**: Inlined in the pippenger functions

The final MSM result combines all rounds (MSB-first weighting):

$$\text{MSM} = \sum_{j=0}^{r-1} R^{(j)} \cdot 2^{c(r-1-j)}$$

Evaluated using Horner's method (starting from the most significant slice):

```cpp
msm_accumulator = point_at_infinity
for j = 0 to r-1:
    for i = 0 to c-1:
        msm_accumulator = msm_accumulator.double()    // c doublings
    msm_accumulator += bucket_result[j]               // one addition
```

Note: The last round may use fewer than $c$ doublings if `NUM_BITS_IN_FIELD % c != 0`.

## Affine Addition Trick (Montgomery's Trick)

The key optimization is batching point additions using a single inversion.

### Problem

Affine point addition $P + Q$ requires computing:

$$\lambda = \frac{Q_y - P_y}{Q_x - P_x}$$

Each addition needs one field inversion, which is expensive.

### Solution: Batch Inversion

For $m$ independent additions $(P_1 + Q_1), \ldots, (P_m + Q_m)$:

1. Compute differences: $d_i = Q_{i,x} - P_{i,x}$

2. Compute running products:
   $$\pi_1 = d_1, \quad \pi_2 = d_1 \cdot d_2, \quad \ldots, \quad \pi_m = \prod_{i=1}^{m} d_i$$

3. **Single inversion**: $\pi_m^{-1}$

4. Recover individual inverses using:
   $$d_m^{-1} = \pi_{m-1} \cdot \pi_m^{-1}$$
   $$d_{m-1}^{-1} = \pi_{m-2} \cdot (d_m \cdot \pi_m^{-1})$$
   $$\vdots$$

**Cost**: 1 inversion + $O(m)$ multiplications (forward product + backward propagation), instead of $m$ inversions.

## Algorithm Variants

**Entry Points**:
- `msm()` - Main entry point (**unsafe by default**, `handle_edge_cases=false`)
- `pippenger()` - Safe wrapper (**safe by default**, `handle_edge_cases=true`)
- `pippenger_unsafe()` - Explicitly unsafe wrapper (`handle_edge_cases=false`)
- `batch_multi_scalar_mul()` - Multi-MSM batch processing (**safe by default**, `handle_edge_cases=true`)

The implementation provides two algorithm variants selected via `handle_edge_cases`:

### Incomplete Addition Formula: The Edge Cases

The affine point addition formula computes $P + Q$ as:

$$\lambda = \frac{Q_y - P_y}{Q_x - P_x}, \quad R_x = \lambda^2 - P_x - Q_x, \quad R_y = \lambda(P_x - R_x) - P_y$$

This formula is **incomplete**—it fails in three cases:

| Case | Condition | Geometric Meaning | Formula Failure |
|------|-----------|-------------------|-----------------|
| **Doubling** | $P = Q$ | Point added to itself | $\lambda = \frac{0}{0}$ (indeterminate) |
| **Inverse** | $P = -Q$ | $P_x = Q_x$, $P_y = -Q_y$ | $\lambda = \frac{-2P_y}{0}$ (division by zero) |
| **Identity** | $P = \mathcal{O}$ or $Q = \mathcal{O}$ | Adding point at infinity | Formula undefined for $\mathcal{O}$ |

**Point doubling** requires a different formula: $\lambda = \frac{3P_x^2 + a}{2P_y}$ (where $a$ is the curve parameter).

**Jacobian coordinates** handle all edge cases correctly (doubling, infinity, inverse points), at the cost of more field operations per addition.

### Jacobian Pippenger (`handle_edge_cases=true`)

**Implementation**: `jacobian_pippenger_with_transformed_scalars()`

Uses **Jacobian coordinates** for bucket accumulators (`JacobianBucketAccumulators`).

- **Pros**: Handles all edge cases (point doubling, point at infinity) correctly
- **Cons**: Slower due to Jacobian arithmetic overhead (~2-3× slower than affine variant)
- **When to use**: When input points may have dependencies (e.g., same point appears multiple times, or P and -P both appear)

### Affine Pippenger with Batch Inversion (`handle_edge_cases=false`)

**Implementation**: `affine_pippenger_with_transformed_scalars()`

Uses **affine coordinates** for bucket accumulators (`BucketAccumulators`) with Montgomery's batch inversion trick.

- **Pros**: 2-3× faster due to batch inversion optimization (single inversion + 3n muls instead of n inversions)
- **Cons**: Assumes no edge cases (incomplete addition formula fails on point doubling)
- **When to use**: When input points are guaranteed to be linearly independent (e.g., SRS points, random points)

**Entry point defaults**:
- `msm()` → `handle_edge_cases=false` (**unsafe by default**, assumes linearly independent points)
- `pippenger()` → `handle_edge_cases=true` (safe wrapper, handles edge cases)
- `pippenger_unsafe()` → explicitly uses `handle_edge_cases=false`

⚠️ **Use `msm()` or `pippenger_unsafe()` only when points are guaranteed linearly independent** (e.g., SRS points, randomly sampled points). For user-controlled or potentially duplicate points, use `pippenger()`.

## Tuning Constants and Cost Model

The implementation uses empirically-tuned constants defined in `scalar_multiplication.hpp`:

### Algorithm Selection Thresholds

| Constant | Value | Purpose |
|----------|-------|---------|
| `PIPPENGER_THRESHOLD` | 16 | Below this, use naive scalar multiplication |
| `AFFINE_TRICK_THRESHOLD` | 128 | Below this, batch inversion overhead exceeds savings |
| `MAX_SLICE_BITS` | 20 | Upper bound on bucket count exponent ($2^{20}$ = 1M buckets) |

**Rationale for PIPPENGER_THRESHOLD=16**: For very small $n$, the overhead of bucket setup, sorting, and reduction exceeds the savings from Pippenger's $O(n/\log n)$ complexity. Naive double-and-add is simpler and faster.

**Rationale for AFFINE_TRICK_THRESHOLD=128**: The batch inversion trick has fixed overhead (computing product tree, one inversion, backtracking). For small batches, this overhead exceeds the cost of individual Jacobian additions.

### Cost Model Constants

These constants model relative operation costs for algorithm selection:

| Constant | Value | Meaning |
|----------|-------|---------|
| `BUCKET_ACCUMULATION_COST` | 5 | Cost of bucket reduction relative to point addition |
| `AFFINE_TRICK_SAVINGS_PER_OP` | 5 | Field multiplications saved per batch affine add |
| `JACOBIAN_Z_NOT_ONE_PENALTY` | 5 | Extra cost when Jacobian $Z \neq 1$ |
| `INVERSION_TABLE_COST` | 14 | Cost of 4-bit lookup table for modular exponentiation |

**Derivation of BUCKET_ACCUMULATION_COST=5**: Bucket reduction performs 2 Jacobian additions per bucket (prefix_sum update + sum update). Each Jacobian add costs ~12-16 field multiplications vs ~6 for mixed affine-Jacobian. Ratio ≈ 2.5×, times 2 adds = 5.

**Derivation of AFFINE_TRICK_SAVINGS_PER_OP=5**: Affine addition with precomputed inverse costs ~3 multiplications. Jacobian addition costs ~12-16 multiplications. Savings ≈ 10-13 muls, but batch inversion adds ~3 muls per element (product tree). Net savings ≈ 5 muls/op.

### Memory and Batching Constants

| Constant | Value | Rationale |
|----------|-------|-----------|
| `BATCH_SIZE` | 2048 | Points per batch inversion (fits in L2 cache) |
| `PREFETCH_LOOKAHEAD` | 32 | Points to prefetch ahead |
| `PREFETCH_INTERVAL` | 16 | Prefetch every N iterations (power of 2 for fast modulo) |
| `RADIX_BITS` | 8 | Bits per radix sort pass (256 buckets = good cache behavior) |

**Rationale for BATCH_SIZE=2048**: Each `AffineElement` is 64 bytes. Batch of 2048 points = 128 KB, comfortably fitting in L2 cache (typically 256 KB - 1 MB). Larger batches would cause cache thrashing during the batch inversion's forward/backward passes; smaller batches increase per-batch overhead (one inversion per batch).

**Rationale for RADIX_BITS=8**: 8 bits gives 256 radix buckets. The counting array (256 × 4 bytes = 1 KB) fits in L1 cache. Larger radix (e.g., 11 bits = 2048 buckets) would exceed L1 capacity.

## Implementation Details

### Zero Scalar Filtering

Before the main Pippenger algorithm, the implementation filters out zero scalars as an optimization.

**Rationale**: Since $0 \cdot P_i = \mathcal{O}$ (point at infinity), zero scalars contribute nothing to the MSM result. Filtering them out reduces the work in all subsequent steps.

**Algorithm** (`transform_scalar_and_get_nonzero_scalar_indices`):

1. **Montgomery conversion**: Convert scalars from Montgomery to non-Montgomery form (required for bucket index computation)
2. **Pass 1** (parallel): Each thread scans its chunk of scalars and collects indices of nonzero scalars into a thread-local vector
3. **Consolidation**: Compute total count and resize output array
4. **Pass 2** (parallel): Each thread copies its indices to the appropriate offset in `nonzero_scalar_indices`

#### Why Scalars Are Modified In-Place

The Montgomery conversion modifies scalars via `const_cast`. This is intentional:

**Problem**: Bucket index extraction requires non-Montgomery form. Creating a copy would double memory usage for scalar arrays (significant for large MSMs).

**Solution**: The function converts in-place and documents that scalars are mutated. Callers who need original values must copy beforehand.

**Why it's safe**: The scalar values after conversion are still mathematically equivalent (same integer, different representation). The MSM result is identical.

**Result**: A compact array `nonzero_scalar_indices` containing indices `i` where `scalars[i] ≠ 0`.

**Impact**:
- For dense inputs (most scalars nonzero): Minimal overhead (~2-3% for the scan)
- For sparse inputs (many zero scalars): Significant speedup by reducing points processed in all rounds

All subsequent algorithm steps (point scheduling, bucket accumulation) operate only on the filtered nonzero scalar indices.

### Bucket Existence Tracking

Each `BucketAccumulators` struct maintains a `BitVector bucket_exists` alongside the bucket array.

#### Why Track Existence with a Bitmap?

**Alternative 1: Clear all buckets between rounds**
- Cost: $O(2^c)$ writes per round to zero out bucket memory
- For $c = 15$ (32K buckets × 64 bytes = 2 MB): expensive memset each round

**Alternative 2: Sentinel value (e.g., x = 0 for "empty")**
- Problem: Point at infinity is a valid accumulator state
- Problem: Extra branch on every bucket access to check sentinel

**Bitmap approach**:
- Cost: $O(2^c / 64)$ words to clear (512 bytes for 32K buckets)
- Single bit test in `accumulate_buckets` loop (efficiently predicted)
- Bitmap fits in L1 cache even for large bucket counts

**Implementation**: `BitVector` in `bitvector.hpp` provides cache-efficient bit operations with word-aligned clearing.

### Point Schedule

The point schedule is a **sorted list of (point_index, bucket_index) pairs** for a given round.

Each entry is packed as:
```
point_schedule[i] = (point_index << 32) | bucket_index
```

where `bucket_index = get_scalar_slice(scalar[point_index], round, bits_per_slice)`.

#### Why This Packing Format?

**Bucket index in low 32 bits**: We pack `bucket_index` in bits [31:0] so the radix digits are taken directly from the low word. The MSD radix sort operates over the `bucket_index_bits` range (padded to a byte boundary), grouping entries by bucket.

**Point index in high 32 bits**: After sorting, extracting `point_index` is a simple right-shift (`entry >> 32`). No masking needed.

**Why not two separate arrays?** A single packed array has better cache locality during sorting. Co-locating point_index and bucket_index in the same cache line improves throughput.

**32-bit fields**: Sufficient for $2^{32}$ points (4 billion) and $2^{32}$ buckets. In practice, we never exceed $2^{24}$ points or $2^{20}$ buckets.

**Example** (4 points, round $j$):

```
Before sorting (order by point index):
  point 0 → bucket 5    (scalar[0] has slice value 5 in round j)
  point 1 → bucket 2
  point 2 → bucket 5
  point 3 → bucket 1

After radix sort (order by bucket index):
  point 3 → bucket 1
  point 1 → bucket 2
  point 0 → bucket 5
  point 2 → bucket 5   ← consecutive same-bucket = Case 1 (happy path)
```

Sorting groups points by their target bucket, so consecutive entries often share the same bucket. This enables **Case 1** (batch add two points directly) and reduces random memory access to bucket accumulators.

#### Why MSD Radix Sort?

**Implementation**: `sort_point_schedule_and_count_zero_buckets()` in `process_buckets.cpp`

We use **in-place MSD radix sort** rather than comparison-based sorting (e.g., `std::sort`):

| Property | MSD Radix Sort | `std::sort` (introsort) |
|----------|----------------|------------------------|
| Complexity | $O(n \cdot k)$ where $k$ = digit levels | $O(n \log n)$ comparisons |
| Cache behavior | Sequential scans per bucket | Random access (pivot comparisons) |
| Branch prediction | Predictable loops | Data-dependent branches |
| Memory | In-place (no extra buffer) | In-place |

**Algorithm details**:

1. **Byte-aligned padding**: `bucket_index_bits` is rounded up to the next multiple of `RADIX_BITS` (8) so the initial digit is byte-aligned. For 10-bit bucket indices, we pad to 16 bits and start at shift 8.

2. **Recursive MSD traversal**: Sorting proceeds from the most significant radix digit down to the least significant via recursion. Each level counts bucket sizes, computes prefix offsets, then performs an **in-place cycle permutation** to place elements into their digit buckets.

3. **Early termination**: Sub-buckets of size 0 or 1 are not recursed, reducing work when distribution is sparse.

4. **Not stable**: The in-place permutation does not preserve relative order of equal keys (stability not required for this use case).

**Why MSD over LSD?** MSD allows early termination for small buckets and naturally integrates zero-bucket counting (see below).

**Why 8 bits per pass (RADIX_BITS=8)?** The counting histogram (256 entries × 4 bytes = 1 KB) fits in L1 cache.

#### Zero-Bucket Counting Mechanism

The sort function counts entries whose **bucket index is 0 for this round** (slice value == 0). These entries contribute nothing to this round's buckets and can be skipped.

**How it works**:

1. **Condition**: Zero counting via `bucket_counts[0]` only happens when `initial_shift == 0`, i.e., when `bits_per_slice <= RADIX_BITS` (8). In this case, there's only one radix digit and no recursion.

2. **Counting**: At the final digit level on the top-level array, `bucket_counts[0]` gives the count of entries with bucket index 0.

3. **Validation**: After sorting, we verify the first entry has `bucket_index == 0`. If not (e.g., no zeros exist), we return `num_zero_entries = 0`.

**Limitation**: For `bits_per_slice > RADIX_BITS`, the recursion splits the array before reaching `shift == 0` at the top level, so zero counting is not performed (returns 0). This is acceptable because larger slice sizes are rare in practice.

**Note**: "Bucket index 0" means the scalar slice is zero for *this round*, not that the entire scalar is zero.

### batch_accumulate_points_into_buckets Algorithm

This function processes the sorted point schedule into bucket accumulators using an **iterative batching loop**.

**Core Processing Loop** (implemented in `process_bucket_pair` helper):

For each pair of consecutive schedule entries:

| Condition | Action | Iterator Update |
|-----------|--------|-----------------|
| **Case 1**: `bucket[i] == bucket[i+1]` | Queue both points for batch addition | `point_it += 2` |
| **Case 2**: Different buckets, accumulator exists | Queue point + accumulator for addition | `point_it += 1` |
| **Case 3**: Different buckets, no accumulator | Cache point into bucket | `point_it += 1` |

The algorithm uses **branchless conditional moves** in the hot path to minimize pipeline flushes.

#### Why Branchless Code?

The case selection (same bucket vs. different bucket, accumulator exists vs. empty) depends on runtime data. A naive `if-else` implementation would cause **branch mispredictions** ~25-50% of the time (bucket collisions are somewhat random).

**Cost of misprediction**: Modern CPUs have 15-20 stage pipelines. A mispredicted branch flushes the pipeline, costing ~15-20 cycles. At millions of iterations, this adds up.

**Branchless solution**: Use conditional moves (`cmov` on x86) that select between values without branching:
```cpp
// Instead of: if (condition) x = a; else x = b;
// Use: x = condition ? a : b;  // Compiler emits cmov
```

The compiler generates `cmov` instructions when both `a` and `b` are cheap to compute. This executes both paths but selects the result without pipeline flush.

#### Prefetching Strategy

Memory access patterns in `batch_accumulate_points_into_buckets` are semi-random (point indices after sorting are not sequential). Without prefetching, each point load would stall for ~100+ cycles (DRAM latency).

**Constants**:
- `PREFETCH_LOOKAHEAD = 32`: Prefetch points 32 iterations ahead
- `PREFETCH_INTERVAL = 16`: Issue prefetch every 16 iterations

**Rationale**: Prefetching too early wastes cache space; too late doesn't hide latency. At ~10 cycles/iteration and ~100 cycles memory latency, we need ~10 iterations of lookahead. We use 32 for safety margin.

**Why interval of 16?** Prefetch instructions have overhead (~1 cycle each). Issuing one every iteration would add ~10% overhead. Every 16 iterations (using `i & 15 == 0` bitmask) amortizes this cost while still hiding latency for most accesses.

**Batching Flow**:

1. **Fill Phase**: Process point schedule entries, queuing additions into scratch space (up to 2048 points)
2. **Batch Addition**: When scratch space is full, invoke `add_affine_points` (Montgomery's batch inversion trick)
3. **Recirculation Phase**: Process addition outputs, pairing same-bucket results or caching into bucket accumulators
4. **Repeat**: Loop back to step 1 with queued results until all points are consumed

The function processes batches iteratively until the entire point schedule is consumed and all partial results are accumulated into buckets.

#### Why the Recirculation Pattern?

After batch addition, we have $m/2$ result points (from $m$ input points). These results target various buckets and may themselves form pairs for the next batch.

**Naive approach**: Write each result directly to its bucket accumulator.
- Problem: Random bucket access (cache misses)
- Problem: Many buckets → sparse accumulator array → poor cache utilization

**Recirculation approach**: Keep results in the scratch buffer and try to pair them first.
- Results targeting the same bucket can be added together (staying in fast scratch memory)
- Only "orphan" results (no pair available) get written to bucket accumulators
- This reduces random memory access by ~50% in practice

The iterative loop continues until the scratch buffer drains completely, with each iteration roughly halving the number of pending points (since pairs get combined).

## Parallelization

### Thread-Local Storage

The implementation uses **per-thread buffers** rather than shared data structures:

| Buffer | Size | Purpose |
|--------|------|---------|
| `BucketAccumulators` (affine) | $2^c × 64$ bytes | Affine bucket array + bitmap |
| `JacobianBucketAccumulators` | $2^c × 96$ bytes | Jacobian bucket array + bitmap |
| `AffineAdditionData` | ~400 KB | Scratch for batch inversion (affine only) |
| `point_schedule` | $n × 8$ bytes | Per-MSM point schedule (affine only) |

**Why thread-local?**
- **No locks**: Each thread operates on its own buckets, eliminating contention
- **Cache locality**: Thread's working set stays in its L2/L3 cache
- **Predictable allocation**: Buffers allocated once, reused across rounds

**Tradeoff**: Memory usage scales with thread count. For 64 threads with $c = 15$: $64 × 2$ MB = 128 MB for bucket accumulators alone. This is acceptable for server-class machines but should be considered for memory-constrained environments.

### Work Unit Splitting

For `batch_multi_scalar_mul()` processing multiple MSMs, work is distributed across threads using `MSMWorkUnit` structures.

**Key design**: A single MSM can be **split across multiple threads** via `MSMWorkUnit`, which specifies:
- `batch_msm_index`: Which MSM this work unit belongs to
- `start_index`: Starting offset within that MSM's scalar indices
- `size`: Number of points in this work unit

**Splitting criterion**: Each thread should receive approximately equal total point count, not equal MSM count.

**Example**: Given 4 MSMs of sizes [1000, 100, 100, 100] and 2 threads:
- Bad split: Thread 1 gets MSM 0-1 (1100 points), Thread 2 gets MSM 2-3 (200 points)
- Good split: Thread 1 gets MSM 0 (1000 points), Thread 2 gets MSM 1-3 (300 points)

For a single large MSM, multiple threads each compute partial results on different point subsets, which are then accumulated in a final single-threaded reduction phase.

**Implementation**: `get_work_units()` computes cumulative point counts and assigns work units to threads such that each thread's total is approximately `total_points / num_threads`.


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
2. Bernstein, D.J. et al. "Faster batch forgery identification" (Montgomery's trick for batch inversion)
