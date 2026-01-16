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

Each 254-bit scalar $s_i$ is decomposed into $r$ slices of $c$ bits each:

$$s_i = \sum_{j=0}^{r-1} s_i^{(j)} \cdot 2^{jc}$$

where:
- $c = \lceil \log_2(\sqrt{n}) \rceil$ is the optimal bucket count exponent
- $r = \lceil 254 / c \rceil$ is the number of rounds
- $s_i^{(j)} \in [0, 2^c - 1]$ is the slice value, which becomes the bucket index

### Step 2: Bucket Accumulation

For each round $j$, points are added into buckets based on their scalar slice value:

$$B_k^{(j)} = \sum_{\{i : s_i^{(j)} = k\}} P_i$$

Each bucket $B_k$ accumulates the sum of all points whose scalar has slice value $k$ in round $j$.

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

The implementation provides two algorithm variants selected via `handle_edge_cases`:

### Small Pippenger (`handle_edge_cases=true`)

Uses **Jacobian coordinates** for bucket accumulators (`JacobianBucketAccumulators`).

- **Pros**: Handles all edge cases (point doubling, point at infinity) correctly
- **Cons**: Slower due to Jacobian arithmetic overhead
- **When to use**: When input points may have dependencies (e.g., same point appears multiple times, or P and -P both appear)

### Pippenger with Affine Trick (`handle_edge_cases=false`)

Uses **affine coordinates** for bucket accumulators (`BucketAccumulators`) with Montgomery's batch inversion trick.

- **Pros**: Faster due to batch inversion optimization
- **Cons**: Assumes no edge cases (incomplete addition formula)
- **When to use**: When input points are guaranteed to be linearly independent (e.g., SRS points)

The `msm()` function defaults to `handle_edge_cases=false` for performance, while `pippenger()` defaults to `handle_edge_cases=true` for safety.

## Implementation Details

### Zero Scalar Filtering

Before the main Pippenger algorithm, the implementation filters out zero scalars as an optimization.

**Rationale**: Since $0 \cdot P_i = \mathcal{O}$ (point at infinity), zero scalars contribute nothing to the MSM result. Filtering them out reduces the work in all subsequent steps.

**Algorithm** (`get_nonzero_scalar_indices`):

1. **Pass 1** (parallel): Each thread scans its chunk of scalars and collects indices of nonzero scalars into a thread-local vector
2. **Consolidation**: Compute total count and resize output array
3. **Pass 2** (parallel): Each thread copies its indices to the appropriate offset in `nonzero_scalar_indices`

**Result**: A compact array `nonzero_scalar_indices` containing indices `i` where `scalars[i] ≠ 0`.

**Impact**:
- For dense inputs (most scalars nonzero): Minimal overhead (~2-3% for the scan)
- For sparse inputs (many zero scalars): Significant speedup by reducing points processed in all rounds

All subsequent algorithm steps (point scheduling, bucket accumulation) operate only on the filtered nonzero scalar indices.

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
// Single MSM - scalars in Montgomery form (standard representation)
// msm() handles Montgomery conversion internally and leaves scalars unchanged
std::vector<fr> scalars = ...;  // Montgomery form
std::vector<g1::affine_element> points = ...;
PolynomialSpan<fr> scalar_span(0, scalars);
auto result = MSM<curve::BN254>::msm(points, scalar_span);
// scalars are still in Montgomery form here

// Batch MSM (multiple MSMs, better parallelization)
// Note: batch_multi_scalar_mul expects scalars in NON-Montgomery form
auto results = MSM<curve::BN254>::batch_multi_scalar_mul(points_spans, scalars_spans);
```

### Montgomery Form Handling

The MSM implementation requires scalars in **non-Montgomery form** internally. The API handles this as follows:

| Function | Input Scalar Form | Converts Internally? | Scalars Modified? |
|----------|-------------------|---------------------|-------------------|
| `msm()` | Montgomery | Yes (from/to) | No (restored) |
| `pippenger()` | Montgomery | Yes (via msm) | No (restored) |
| `batch_multi_scalar_mul()` | Non-Montgomery | No | N/A |

For most users, `msm()` or `pippenger()` are the recommended entry points as they handle Montgomery conversion automatically.

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
