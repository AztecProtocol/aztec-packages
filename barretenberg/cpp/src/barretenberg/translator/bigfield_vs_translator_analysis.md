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

## x Power Computation: Batch Size Optimization

### Key Insight: Batch Size Tradeoff

The batch size creates a tradeoff:
- **Smaller batches** → fewer sequential powers, but more batch multipliers and more `mult_madd` calls
- **Larger batches** → more sequential powers, but fewer batch multipliers

### Measured Results (4096 rows)

| BATCH_SIZE | Sequential Powers | Batch Multipliers | Column Computation | **TOTAL** | **Log2** |
|------------|-------------------|-------------------|-------------------|-----------|----------|
| 16         | 515               | 33,008            | 124,358           | 157,881   | 17.27    |
| 32         | 995               | 14,674            | 82,045            | 97,714    | 16.58    |
| 64         | 1,955             | 6,452             | 61,845            | 70,252    | 16.10    |
| 128        | 3,875             | 2,806             | 51,290            | 57,971    | 15.82    |
| **256**    | **7,715**         | **1,208**         | **46,245**        | **55,168**| **15.75**|
| 512        | 15,395            | 514               | 43,645            | 59,554    | 15.86    |
| 1024       | 30,755            | 212               | 42,341            | 73,308    | 16.16    |

### Optimal: BATCH_SIZE = 256

| Component | Gates (measured) |
|-----------|------------------|
| 256 sequential powers (x^0..x^255) | 7,715 |
| Batch multipliers (16 batches) | 1,208 |
| Column computation (16 batches × 5 cols) | 46,245 |
| **Computation subtotal** | **55,168 (2^15.75)** |

### Limb Decomposition Overhead

The op queue stores values as 136-bit limbs (`x_lo`, `x_hi`), but bigfield uses 68-bit limbs internally.
Even with pre-constrained inputs, we must split each 136-bit limb into two 68-bit limbs and constrain the split.

| Component | Gates |
|-----------|-------|
| Limb decomposition (4096 rows × 5 cols × ~4 gates) | ~82,000 |
| Computation (powers + column sums) | ~55,000 |
| **Total** | **~137,000 (2^17.06)** |

### Why 256 is Optimal

1. **Sequential powers**: 255 multiplications × ~30 gates = 7,650 gates (matches measurement)
2. **Batch multipliers**: Need x^256, x^512, ..., x^{15×256} - computed via binary exponentiation
3. **Column computation**: 16 batches × 5 columns × (~520 gates per mult_madd + ~55 gates scaling) ≈ 46,000 gates

The sweet spot is where the decreasing batch multiplier cost intersects with increasing column computation cost.

---

## Comparison

| Approach | Circuit Size | Log2 | vs Translator |
|----------|-------------|------|---------------|
| Current Translator | 131,072 | 17.0 | baseline |
| **Bigfield (batch=256)** | **~137,000** | **17.06** | **similar size** |

**Note**: While the circuit size is similar, the main benefits are:
1. **Much simpler codebase** - eliminates 7 relation types, 139 subrelations
2. **Uses audited bigfield primitives** - less custom code to audit
3. **LightZK flavor** - fewer polynomials → smaller proof and less memory

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

### Implementation Considerations for LightZK Flavor

Creating a dedicated LightZK flavor requires several changes:

1. **Flavor concepts** (`flavor_concepts.hpp`):
   - Current: `HasDataBus` is tied to `IsMegaFlavor`, but LightZK needs ecc_op_wires without databus
   - Need: Separate `HasEccOpWires` concept from `HasDataBus`
   - Or: Create `IsLightZKFlavor` concept that has ecc_op_wires but not databus

2. **ProverInstance** (`prover_instance.hpp`):
   - Current: Uses `IsMegaFlavor` to decide whether to allocate ecc_op and databus polynomials
   - Need: Separate checks for ecc_op allocation vs databus allocation

3. **Circuit finalization** (`mega_circuit_builder.cpp`):
   - Current: `finalize_circuit` always adds databus gates to ensure non-zero polynomials
   - Need: Skip databus finalization for LightZK (no databus relations)

4. **Relations tuple**:
   - LightZK relations: Arithmetic, Permutation, DeltaRange, Elliptic, NNF, EccOpQueue
   - Remove: LogDerivLookup, Memory, Databus, Poseidon2

**Current approach**: Use MegaFlavor for initial BigfieldTranslator proving (verified working).
The unused databus/lookup polynomials add overhead but proving still works.
LightZK optimization can be added later as a separate PR.

### Memory Footprint (Measured)

**Issue: Circuit finalization doubles gate count**

The initial gate count (~167K) doubles to ~301K after finalization due to:
1. Deferred NNF multiplication gates (~67K)
2. Deferred range constraint batching (~67K)

This results in **2^19 dyadic size** instead of the hoped-for 2^18.

**Measured Memory Comparison:**

| Flavor | Dyadic | Prover Instance | Peak Memory | Witness Entities |
|--------|--------|-----------------|-------------|------------------|
| **Translator** | 2^17 | ~200 MB | **247 MB** | 91 |
| **MegaZKFlavor** | 2^19 | 758 MB | **1,090 MB** | 25 |
| **LightZKFlavor** | 2^19 | 518 MB | **717 MB** | 9 |

**Analysis:**
- LightZK is **34% better than MegaZK** (717 MB vs 1,090 MB peak)
- But LightZK is **worse than Translator** (717 MB vs 247 MB peak)

The reason: Translator has 2^17 dyadic size with 91 witness polynomials, while LightZK has 2^19 dyadic size with 9 witness polynomials.

Total witness elements:
- **Translator**: 91 × 2^17 = ~12M elements
- **LightZK**: 9 × 2^19 = ~4.7M elements

Despite LightZK having fewer total elements, the larger dyadic size (4x) affects other allocations:
- Non-gate selectors are allocated at full dyadic size
- Sigma/ID polynomials scale with trace_active_range_size
- Commitment key and sumcheck working memory scale with dyadic size

### Proof Size Benefit

**Prover commits to only 5 witness polys** (selectors in fixed VK, ecc_op_wires reused from merge):
- Wires: w_l, w_r, w_o, w_4 (4)
- z_perm (1)

**Chonk proof size reduction**: Translator currently has 88 witness commitments. LightZK reduces this to 5, significantly shrinking the final Chonk proof.

---

## Conclusion: Why This Approach Fails

| Approach | Dyadic Size | Peak Memory | Verdict |
|----------|-------------|-------------|---------|
| **Translator** | 2^17 | **247 MB** | Current baseline |
| **LightZK Bigfield** | 2^19 | **717 MB** | **2.9x worse** |

### Root Cause: Bigfield's Deferred Constraints

The bigfield library uses two optimization techniques that defer constraint creation to circuit finalization:

1. **Deferred NNF multiplications**: Partial multiplication witnesses are cached and deduplicated at finalization, then ~67K NNF gates are added.

2. **Deferred range constraints**: All range-constrained variables are collected in `range_lists`, sorted at finalization, and ~67K delta_range gates are added.

These optimizations are beneficial for general circuits (deduplication, batching), but for the Translator replacement they cause the gate count to **double** from ~167K to ~301K, pushing the dyadic size from 2^18 to 2^19.

### The Fundamental Problem

The Translator VM was designed with memory efficiency as a primary goal:
- **Interleaved polynomial structure**: 16 mini-circuits (2^13 each) are interleaved into full-size (2^17) polynomials
- **Sparse allocations**: Most of the 91 witness polynomials only store data in the mini-circuit region
- **Custom relations**: Relations are tailored to the specific computation, avoiding general-purpose overhead

Bigfield takes the opposite approach:
- **General-purpose primitives**: Designed for flexibility, not minimal gate count
- **Full polynomial allocations**: No interleaving or sparse structure
- **Deferred constraints**: Beneficial for deduplication but adds gates at finalization

### Why This Gap Cannot Be Closed

The 3x memory difference (717 MB vs 247 MB) is not fixable with incremental changes:

1. **Dyadic size is fundamental**: Going from 2^19 to 2^17 requires 4x fewer gates. Even with eager constraints, the ~167K gates before finalization already exceed 2^17 = 131K.

2. **Bigfield's gate overhead is inherent**: Each bigfield operation requires limb decomposition, range constraints, and NNF gates. This is the cost of using general-purpose non-native field arithmetic.

3. **Translator's interleaving is key**: The Translator achieves 2^17 by processing 16 mini-circuits of 2^13 rows in an interleaved fashion. The bigfield approach processes all 4096 rows in a single pass, requiring full-size polynomials.

4. **No path to 2^17**: Even optimizing bigfield to zero deferred constraints would still yield ~167K gates → 2^18 dyadic size → still 2x worse than Translator.

### Recommendation

**Keep the existing Translator VM.**

The Translator's complexity (7 relation types, 139 subrelations) is the price paid for memory efficiency. This is a worthwhile trade-off because:
- Memory is the primary constraint in client-side proving
- The 3x memory difference (717 MB vs 247 MB) cannot be bridged
- Code simplification does not justify 3x resource regression

---

## Circuit Finalization: Why Gates Double

### Measured Gate Counts (4096 op queue rows)

```
Before finalization:  167,597 gates
After finalization:   301,374 gates
Finalization added:   133,777 gates
```

### Block Breakdown Before Finalization

| Block | Gates | Notes |
|-------|-------|-------|
| arithmetic | 86,413 | Main computation gates |
| delta_range | 0 | Empty until finalization |
| elliptic | 0 | Not used |
| nnf | 81,184 | Limb accumulation gates from `range_constrain_two_limbs` |
| ecc_op | 8,192 | 4096 rows × 2 gates per row |

### Deferred Operations in Finalization

Bigfield defers two types of constraints to enable batching/deduplication optimizations:

#### 1. Non-Native Field Multiplications (~67K gates)

Bigfield caches partial NNF multiplications during circuit construction (`queue_partial_non_native_field_multiplication`). At finalization:

1. **Deduplication**: Removes duplicate multiplications (biggroup operations often produce the same mults)
2. **Gate creation**: 4 NNF gates per unique multiplication

```
Cached NNF mults before dedup:  20,403
After dedup (estimated):        ~16,700
NNF gates added:                ~66,800 (4 × 16,700)
```

#### 2. Range Constraint Batching (~67K gates)

All range constraints are batched via the `range_lists` mechanism:

| Range | Variables | Notes |
|-------|-----------|-------|
| 16383 (14-bit) | 212,837 | From 68-bit limb decomposition (5 × 14-bit sublimbs) |
| 4095 (12-bit) | 36,947 | Partial limbs |
| 255 (8-bit) | 8,821 | Small range constraints |
| 15 (4-bit) | 8,201 | Nibble constraints |
| Other | 1,273 | Various sizes |
| **Total** | **268,079** | |

**Processing at finalization**:
1. For each unique range, create a "lookup table" of valid values (negligible gates)
2. Sort all variables by value
3. Create delta_range gates verifying sorted order (4 variables per gate)

```
Expected delta_range gates: 268,079 / 4 ≈ 67,019
```

### Why This Architecture?

1. **NNF deduplication**: Biggroup operations frequently compute the same limb products. Caching and deduplicating removes ~20% of NNF gates.

2. **Range batching**: Instead of creating individual range check circuits for each variable, variables with the same range are batched into a single sorted permutation. The delta_range relation verifies `D(D-1)(D-2)(D-3)=0` where D is the difference between adjacent sorted values.

3. **Trade-off**: The "doubled" gate count is expected behavior. The 81K NNF gates before finalization are from `range_constrain_two_limbs` which creates limb accumulation gates directly (these verify that sublimbs reconstruct to the original value). The additional 67K NNF gates from finalization are the actual multiplication constraints.

### Finalization Gate Math

| Component | Gates |
|-----------|-------|
| NNF multiplications (after dedup) | ~67,000 |
| Delta range (sorted permutation) | ~67,000 |
| Overhead (poly non-zero, public inputs) | ~100 |
| **Total finalization** | **~134,000** |

This matches the measured 133,777 gates added during finalization.
