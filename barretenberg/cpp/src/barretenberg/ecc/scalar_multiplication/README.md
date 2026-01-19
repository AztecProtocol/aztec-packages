# Pippenger Multi-Scalar Multiplication (MSM)

This document describes the Pippenger MSM implementation in barretenberg.

## Overview

The Pippenger algorithm computes multi-scalar multiplications (MSMs):

$$\text{MSM}(\vec{s}, \vec{P}) = \sum_{i=0}^{n-1} s_i \cdot P_i$$

where $s_i$ are scalars and $P_i$ are elliptic curve points.

**Complexity**: $O(n / \log n)$ group operations, compared to $O(n)$ for naive scalar multiplication.

## Algorithm

### Terminology

**Bucket**: An accumulator (elliptic curve point) that collects all input points whose scalar slice equals a particular value. For $c$-bit slices, there are $2^c$ buckets indexed $0, 1, \ldots, 2^c - 1$. Bucket $k$ accumulates the sum of all points $P_i$ where the scalar slice $s_i^{(j)} = k$.

### Step 1: Scalar Decomposition

**Implementation**: `get_scalar_slice(scalar, round_index, bits_per_slice)`

Each 254-bit scalar $s_i$ is decomposed into $r$ slices of $c$ bits each:

$$s_i = \sum_{j=0}^{r-1} s_i^{(j)} \cdot 2^{jc}$$

where:
- $c$ is the bits per slice (from `get_optimal_log_num_buckets`)
- $r = \lceil 254 / c \rceil$ is the number of rounds (from `get_num_rounds`)
- $s_i^{(j)} \in [0, 2^c - 1]$ is the slice value, which becomes the bucket index

#### Optimal Bucket Count Derivation

The choice of $c$ (bits per slice) minimizes total group operations. Let $B = 2^c$ be the number of buckets.

**Cost components per round:**
1. **Bucket accumulation**: $n$ additions (one per point)
2. **Bucket reduction**: $B - 1$ additions (prefix sum over buckets)

**Total cost** for $r = 254/c$ rounds:

$$T(c) = r \cdot (n + 2^c) = \frac{254}{c} \cdot (n + 2^c)$$

**Minimizing** by taking $\frac{dT}{dc} = 0$:

$$\frac{dT}{dc} = -\frac{254}{c^2}(n + 2^c) + \frac{254}{c} \cdot 2^c \ln 2 = 0$$

Solving: $2^c \ln 2 = \frac{n + 2^c}{c}$

For large $n$ where $n \gg 2^c$: $2^c \approx \frac{n}{c \ln 2}$

Taking $\log_2$: $c \approx \log_2(n) - \log_2(c) - \log_2(\ln 2)$

For practical $n$, this gives $c \approx \frac{1}{2}\log_2(n)$, hence:

$$c = \left\lceil \log_2(\sqrt{n}) \right\rceil$$

**Implementation**: `get_optimal_log_num_buckets(num_points)` computes this with bounds checking ($1 \leq c \leq 20$).

### Step 2: Bucket Accumulation

**Implementation**: `evaluate_affine_pippenger_round()` or `evaluate_jacobian_pippenger_round()`

For each round $j$, points are added into buckets based on their scalar slice value:

$$B_k^{(j)} = \sum_{\{i : s_i^{(j)} = k\}} P_i$$

Each bucket $B_k$ accumulates the sum of all points whose scalar has slice value $k$ in round $j$.

The round evaluation function builds a point schedule (sorted by bucket), then calls `batch_accumulate_points_into_buckets()` to perform the actual bucket accumulation using batch affine additions.

### Step 3: Bucket Reduction

**Implementation**: `accumulate_buckets(bucket_accumulators)`

The round result requires computing a weighted sum of buckets:

$$R^{(j)} = \sum_{k=1}^{2^c - 1} k \cdot B_k^{(j)}$$

This is evaluated efficiently using **prefix sums** (avoiding $k$ repeated additions per bucket):

$$R^{(j)} = \sum_{k=1}^{2^c - 1} \underbrace{\left( \sum_{m=k}^{2^c - 1} B_m^{(j)} \right)}_{\text{running sum}}$$

**Algorithm** (from `accumulate_buckets` template in scalar_multiplication.hpp):
```cpp
prefix_sum = buckets[highest_nonempty]
sum = prefix_sum + offset_generator  // offset avoids incomplete addition edge cases
for k = highest_nonempty - 1 down to 1:
    if bucket[k] exists:
        prefix_sum += bucket[k]
    sum += prefix_sum
return sum - offset_generator
```

#### Why the Offset Generator?

The offset generator $G_{\text{off}}$ prevents edge cases during the prefix sum accumulation:

**Problem**: During the loop, `sum += prefix_sum` might encounter:
- `sum == prefix_sum` → requires point doubling (different formula)
- `sum == -prefix_sum` → result is point at infinity $\mathcal{O}$
- `sum == O` → addition with infinity (special case)

**Solution**: Adding a fixed offset $G_{\text{off}}$ at the start guarantees `sum` never equals `prefix_sum` or its negation (assuming $G_{\text{off}}$ is chosen to be linearly independent of bucket values). The offset is subtracted at the end:

$$R = \left( \sum_k \text{prefix\_sum}_k + G_{\text{off}} \right) - G_{\text{off}} = \sum_k \text{prefix\_sum}_k$$

**Implementation**: `get_offset_generator()` returns a deterministically-derived point that is statistically independent of the input points.

### Step 4: Round Combination

**Implementation**: `accumulate_round_result(msm_accumulator, bucket_result, round_index, bits_per_slice)`

The final MSM result combines all rounds:

$$\text{MSM} = \sum_{j=0}^{r-1} R^{(j)} \cdot 2^{jc}$$

Evaluated using Horner's method (starting from the most significant slice):

```cpp
msm_accumulator = point_at_infinity
for j = 0 to r-1:
    for i = 0 to c-1:
        msm_accumulator = msm_accumulator.double()    // c doublings
    msm_accumulator += bucket_result[j]               // one addition
```

Note: The last round may use fewer than $c$ doublings if $254 \mod c \neq 0$.

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

**Cost**: 1 inversion + $3(m-1)$ multiplications, instead of $m$ inversions.

## Algorithm Variants

**Entry Points**:
- `msm()` - Main entry point (defaults to fast variant)
- `pippenger()` - Safe wrapper (defaults to edge-case handling variant)
- `batch_multi_scalar_mul()` - Multi-MSM batch processing

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

**Jacobian coordinates** handle all cases with unified formulas (no branching), at the cost of more field operations per addition.

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

**Default behaviors**:
- `msm()` → `handle_edge_cases=false` (fast, suitable for most use cases)
- `pippenger()` → `handle_edge_cases=true` (safe, conservative default)

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

**Bucket index in low 32 bits**: Radix sort operates on the low bits of each key. By placing `bucket_index` in bits [31:0], we sort by bucket without bit manipulation. The sort naturally groups points by their target bucket.

**Point index in high 32 bits**: After sorting, extracting `point_index` is a simple right-shift (`entry >> 32`). No masking needed.

**Why not two separate arrays?** A single packed array has better cache locality during sorting. The radix sort touches each element once per pass; having point_index and bucket_index co-located in the same cache line improves throughput.

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

We use **Most Significant Digit (MSD) radix sort** rather than comparison-based sorting (e.g., `std::sort`):

| Property | MSD Radix Sort | `std::sort` (introsort) |
|----------|----------------|------------------------|
| Complexity | $O(n \cdot k)$ where $k$ = digits | $O(n \log n)$ comparisons |
| Cache behavior | Sequential scans | Random access (pivot comparisons) |
| Branch prediction | Predictable loops | Data-dependent branches |
| Parallelism | Bucket-level parallelism | Limited (partition step) |

For $n = 2^{20}$ points with 10-bit bucket indices, MSD radix sort performs $\lceil 10/8 \rceil = 2$ passes of $O(n)$ work each. Comparison sort would perform $\sim 20n$ comparisons with unpredictable branches.

**Why MSD over LSD?** MSD radix sort can terminate early when buckets become small (single-element buckets need no further sorting). It also enables counting zero-bucket entries during the final pass without a separate scan.

**Why 8 bits per pass (RADIX_BITS=8)?** The counting histogram (256 entries × 4 bytes = 1 KB) fits in L1 cache. Each pass makes two sequential scans over the data: one for counting, one for permutation.

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

## Data Structures

### AffineElement (64 bytes)

```cpp
struct AffineElement {
    Fq x;  // 32 bytes (256-bit field element, 4 × uint64_t limbs)
    Fq y;  // 32 bytes
};
```

Each BN254/Grumpkin point is 64 bytes in affine coordinates.

### Point Schedule Entry (8 bytes)

```
bits [63:32] = point_index (into points[] array)
bits [31:0]  = bucket_index
```

### Memory Layout

For $n = 2^{20}$ points, $c = 10$ bits per slice:

| Structure | Size | Notes |
|-----------|------|-------|
| `points[]` | 64 MB | Input points (read-only), $n$ × 64 bytes |
| `bucket_accumulators[]` | 64 KB | $2^{10}$ buckets × 64 bytes |
| `point_schedule[]` | 8 MB | $n$ entries × 8 bytes |
| `scratch_space[]` | 128 KB | 2048 × 64 bytes |

**Cache hierarchy context** (typical modern CPU):
- L1 cache: 32-64 KB per core → holds ~500-1000 points
- L2 cache: 256 KB - 1 MB per core → holds batch scratch space
- L3 cache: 8-32 MB shared → holds point schedule for medium MSMs
- DRAM: ~100 ns latency → main bottleneck for large MSMs

## Parallelization

### Thread-Local Storage

The implementation uses **per-thread buffers** rather than shared data structures:

| Buffer | Size | Purpose |
|--------|------|---------|
| `BucketAccumulators` | $2^c × 64$ bytes | Bucket array + existence bitmap |
| `AffineAdditionData` | ~400 KB | Scratch for batch inversion |
| `point_schedule` | $n × 8$ bytes | Per-MSM point schedule |

**Why thread-local?**
- **No locks**: Each thread operates on its own buckets, eliminating contention
- **Cache locality**: Thread's working set stays in its L2/L3 cache
- **Predictable allocation**: Buffers allocated once, reused across rounds

**Tradeoff**: Memory usage scales with thread count. For 64 threads with $c = 15$: $64 × 2$ MB = 128 MB for bucket accumulators alone. This is acceptable for server-class machines but should be considered for memory-constrained environments.

### Work Unit Splitting

For `batch_multi_scalar_mul()` processing multiple MSMs, work is distributed across threads using `MSMWorkUnit` structures.

**Splitting criterion**: Each thread should receive approximately equal total point count, not equal MSM count.

**Example**: Given 4 MSMs of sizes [1000, 100, 100, 100] and 2 threads:
- Bad split: Thread 1 gets MSM 0-1 (1100 points), Thread 2 gets MSM 2-3 (200 points)
- Good split: Thread 1 gets MSM 0 (1000 points), Thread 2 gets MSM 1-3 (300 points)

**Why this works**: Pippenger complexity is $O(n / \log n)$. For balanced point counts, threads finish at similar times. Imbalanced splits cause one thread to become a bottleneck.

**Implementation**: `get_work_units()` computes cumulative point counts and assigns contiguous MSM ranges to threads such that each thread's total is approximately `total_points / num_threads`.

## Performance Analysis

### Profiling Results

Measured breakdown for single-threaded MSM ($2^{17}$ to $2^{24}$ points):

| Component | Time % | Description |
|-----------|--------|-------------|
| `batch_accumulate_points_into_buckets` | **84-85%** | Point copies + batch additions |
| `accumulate_buckets` | 8-13% | Bucket reduction (prefix sums) |
| `radix_sort` | 2-4% | Point scheduling |
| `schedule_fill` | <3% | Building schedule entries |
| doublings | <0.1% | Round combination |

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
