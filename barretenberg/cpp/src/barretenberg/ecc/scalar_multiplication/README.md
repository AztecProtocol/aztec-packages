# Pippenger Multi-Scalar Multiplication (MSM)

This document describes the Pippenger MSM implementation in barretenberg, including its architecture, performance characteristics, and optimization opportunities.

## Overview

The Pippenger algorithm computes multi-scalar multiplications (MSMs):

$$\text{MSM}(\vec{s}, \vec{P}) = \sum_{i=0}^{n-1} s_i \cdot P_i$$

where $s_i$ are scalars and $P_i$ are elliptic curve points.

**Complexity**: $O(n / \log n)$ group operations, compared to $O(n)$ for naive scalar multiplication.

## Algorithm

### Step 1: Scalar Decomposition

Each 254-bit scalar $s_i$ is decomposed into $r$ slices of $c$ bits each:

$$s_i = \sum_{j=0}^{r-1} s_i^{(j)} \cdot 2^{jc}$$

where:
- $c = \lceil \log_2(\sqrt{n}) \rceil$ is the optimal bucket count exponent
- $r = \lceil 254 / c \rceil$ is the number of rounds
- $s_i^{(j)} \in [0, 2^c - 1]$ is the slice value, which becomes the bucket index

### Step 2: Bucket Accumulation

For each round $j$, points are grouped into $2^c$ buckets based on their scalar slice:

$$B_k^{(j)} = \sum_{\{i : s_i^{(j)} = k\}} P_i$$

This groups all points whose scalar has value $k$ in bit-slice $j$.

### Step 3: Bucket Reduction

The round result requires computing a weighted sum of buckets:

$$R^{(j)} = \sum_{k=1}^{2^c - 1} k \cdot B_k^{(j)}$$

This is evaluated efficiently using **prefix sums** (avoiding $k$ repeated additions per bucket):

$$R^{(j)} = \sum_{k=1}^{2^c - 1} \underbrace{\left( \sum_{m=k}^{2^c - 1} B_m^{(j)} \right)}_{\text{running sum}}$$

**Algorithm**:
```
running_sum = 0
result = 0
for k = 2^c - 1 down to 1:
    if bucket[k] exists:
        running_sum += bucket[k]
    result += running_sum
return result
```

### Step 4: Round Combination

The final MSM result combines all rounds:

$$\text{MSM} = \sum_{j=0}^{r-1} R^{(j)} \cdot 2^{jc}$$

Evaluated using Horner's method (starting from the most significant slice):

```
result = R^(r-1)
for j = r-2 down to 0:
    result = result * 2^c + R^(j)    // c doublings, then one addition
```

## Affine Addition Trick (Montgomery's Trick)

The key optimization is batching point additions using a single inversion.

### Problem

Affine point addition $P + Q$ requires computing:

$$\lambda = \frac{Q_y - P_y}{Q_x - P_x}$$

Each addition needs one field inversion, which is expensive (~100× a multiplication).

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

## Implementation Details

### Point Schedule

The point schedule is a **sorted list of (point_index, bucket_index) pairs** for a given round.

Each entry is packed as:
```
point_schedule[i] = (point_index << 32) | bucket_index
```

where `bucket_index = get_scalar_slice(scalar[point_index], round, bits_per_slice)`.

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

### consume_point_schedule Algorithm

This function processes the sorted point schedule into bucket accumulators.

For each pair of consecutive schedule entries:

| Condition | Action | Iterator Update |
|-----------|--------|-----------------|
| **Case 1**: `bucket[i] == bucket[i+1]` | Queue both points for batch addition | `point_it += 2` |
| **Case 2**: Different buckets, accumulator exists | Queue point + accumulator for addition | `point_it += 1` |
| **Case 3**: Different buckets, no accumulator | Cache point into bucket | `point_it += 1` |

When batch reaches 2048 points, call `add_affine_points`, then process results recursively.

## Data Structures

### AffineElement (128 bytes)

```cpp
struct AffineElement {
    Fq x;  // 32 bytes (256-bit field element, 4 × uint64_t limbs)
    Fq y;  // 32 bytes
};
```

Each BN254/Grumpkin point is 128 bytes in affine coordinates.

### Point Schedule Entry (8 bytes)

```
bits [63:32] = point_index (into points[] array)
bits [31:0]  = bucket_index
```

### Memory Layout

For $n = 2^{20}$ points, $c = 10$ bits per slice:

| Structure | Size | Notes |
|-----------|------|-------|
| `points[]` | 128 MB | Input points (read-only) |
| `bucket_accumulators[]` | 128 KB | $2^{10}$ buckets × 128 bytes |
| `point_schedule[]` | 8 MB | $n$ entries × 8 bytes |
| `scratch_space[]` | 256 KB | 2048 × 128 bytes |

## Performance Analysis

### Profiling Results

Measured breakdown for single-threaded MSM ($2^{17}$ to $2^{24}$ points):

| Component | Time % | Description |
|-----------|--------|-------------|
| `consume_point_schedule` | **84-85%** | Point copies + batch additions |
| `accumulate_buckets` | 8-13% | Bucket reduction (prefix sums) |
| `radix_sort` | 2-4% | Point scheduling |
| `schedule_fill` | <3% | Building schedule entries |
| doublings | <0.1% | Round combination |

### Memory Bandwidth Analysis

The bottleneck is memory bandwidth in `consume_point_schedule`.

**Per point processed**:
- Read: 128 bytes from `points[]`
- Write: 128 bytes to scratch or bucket
- Plus cache misses from random bucket access

**Theoretical minimum** (memory-bound estimate):

For $n$ points, ~$2 \times 128 \times n$ bytes moved per round, with $r \approx 254/c$ rounds:

$$T_{\text{min}} \approx \frac{256 \cdot n \cdot r}{\text{bandwidth}}$$

At 50 GB/s bandwidth, $n = 2^{20}$, $r = 20$:

$$T_{\text{min}} \approx \frac{256 \times 2^{20} \times 20}{50 \times 10^9} \approx 107 \text{ ms}$$

Actual measured: ~480 ms (4.5× theoretical minimum due to cache misses, computation overhead).

## Optimization Attempts and Results

### Attempted: Conditionalize rhs copy
- **Change**: Skip copy to `null_location` when `!do_affine_add`
- **Result**: No measurable improvement
- **Reason**: Branch predictor handles conditional well; copy was already cheap

### Attempted: Ref-based scratch
- **Change**: Store 8-byte refs instead of 128-byte copies during iteration, materialize before batch addition
- **Result**: No measurable improvement
- **Reason**: Same total bytes moved; just different timing. Memory subsystem handles both patterns similarly.

### Not Attempted: Per-bucket run reduction
- **Idea**: For $k$ consecutive points targeting same bucket, reduce in-place before moving to scratch
- **Potential benefit**: Reduces copies by average run length factor
- **Trade-off**: Requires algorithm restructuring

### Not Attempted: Jacobian bucket accumulators
- **Idea**: Store buckets in Jacobian coordinates $(X:Y:Z)$ instead of affine $(x, y)$
- **Benefit**: Faster mixed additions (no inversions during accumulation)
- **Trade-off**: 50% more memory per bucket

## File Structure

```
scalar_multiplication/
├── scalar_multiplication.hpp    # MSM class, data structures
├── scalar_multiplication.cpp    # Core algorithm
├── process_buckets.hpp/cpp      # Radix sort
├── bitvector.hpp                # Bit vector for bucket tracking
└── README.md                    # This file
```

## Usage

```cpp
// Single MSM
auto result = MSM<curve::BN254>::msm(points, scalars);

// Batch MSM (multiple MSMs, better parallelization)
auto results = MSM<curve::BN254>::batch_multi_scalar_mul(points_spans, scalars_spans);
```

## Testing & Benchmarking

```bash
# Tests
cd barretenberg/cpp/build
ninja ecc_tests
./bin/ecc_tests --gtest_filter="*Pippenger*"

# Benchmarks
ninja pippenger_bench
./bin/pippenger_bench

# Remote benchmarks (dedicated instance)
cd barretenberg/cpp
./scripts/benchmark_remote.sh pippenger_bench \
    "./pippenger_bench --benchmark_filter=PippengerBench/Full"
```

## References

1. Pippenger, N. (1976). "On the evaluation of powers and related problems"
2. Bernstein, D.J. et al. "Faster batch forgery identification" (Montgomery's trick for batch inversion)
