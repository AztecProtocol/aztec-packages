# BaseFold Recursive Verifier: Cost Analysis

This document records the circuit cost of the BaseFold recursive verifier
and analyzes potential optimizations.

## Concrete measurement

Parameters: 2^15 MSM over Grumpkin, blowup factor 8 = 2^3, domain size 2^18,
18 fold rounds, 43 queries (~128-bit security).

Measured by `basefold_circuit_cost.test.cpp::FullSizeRecursiveVerifier`, which
builds the actual `RecursiveBaseFoldVerifier<UltraCircuitBuilder>` circuit:

| Metric                     | Value         |
|----------------------------|---------------|
| **Total gates**            | **3,468,269** |
| **Log2(gates)**            | **21.73**     |
| Gates per query            | 80,657        |
| Gates per query per round  | 4,480         |
| Native proof size          | 605 KiB       |
| Raw batch_mul MSM (comparison) | ~12M gates |
| **Improvement over raw MSM** | **~3.5×**   |

### Isolated per-operation costs (for reference)

These were measured by constructing each operation in its own circuit.  They
overestimate the cost in a real circuit (per-circuit overhead is amortized):

| Component                       | Gates (isolated) | Gates (in real circuit) |
|---------------------------------|------------------|------------------------|
| Fold check, e > 0 (4 ops)      | 6,513            | ~4,200 (amortized)     |
| Fold check, e = 0 (2 ops)      | 5,111            | ~3,500 (amortized)     |
| Merkle path, depth 18           | 1,407            | ~1,400                 |
| Merkle path, depth 1            | 149              | ~149                   |

The "in real circuit" column is inferred from the concrete measurement:
3,468,269 / 43 queries / 18 rounds ≈ 4,480 gates per round per query,
which includes both the fold check and 2 Merkle path verifications.

---

## Potential optimizations

### Optimization 1: cross-round batching via random linear combination

**Estimated impact: 10-15% savings on fold cost.**

Instead of checking each round's fold equation independently, compress all 18
checks per query into a single equation using a random linear combination.
This allows batching scalar muls across rounds into fewer `batch_mul` calls,
amortizing ROM table construction and Straus doublings.

Given the concrete 3.5M gate measurement, this would save ~350-500K gates.
Not worth the protocol complexity for a modest gain.

### Optimization 2: reduce number of queries (increase blowup)

**Estimated impact: linear reduction in gates and proof size.**

| Blowup | Queries | Estimated gates | Proof size |
|--------|---------|----------------|------------|
| 8      | 43      | 3.47M          | 605 KiB    |
| 16     | 32      | ~2.58M         | ~450 KiB   |
| 32     | 26      | ~2.10M         | ~365 KiB   |

Trade-off: larger blowup → fewer queries (cheaper verifier) but larger initial
domain (more prover work, bigger precomputed domain data, one more fold round).
Since prover work is native and one-time, this favors the recursive setting.

### Optimization 3: eliminate redundant fold result openings

**Impact: reduces proof size by ~48 KiB.  No effect on gate count.**

The fold result F_r at round r is already opened as one of the pair elements
at round r+1.  Removing the redundant send saves 43 × 18 × 64 bytes ≈ 48 KiB.

### Optimization 4: paired Merkle paths

**Impact: reduces proof size by ~254 KiB.  No effect on gate count.**

See NATIVE_OPTIMIZATIONS.md for details.

---

## What does NOT help (surprising finding)

**The α,β reformulation makes things WORSE, not better.**

The fold formula can be algebraically rewritten as:

```
result = G_0 · α  +  G_1 · β
where  α = s_0^{-e} · (s_1 - z) / (s_1 - s_0)
       β = s_1^{-e} · (z - s_0) / (s_1 - s_0)
```

This looks like it should halve the cost: 2 scalar muls instead of 4.
We benchmarked this and found:

| Formulation        | Scalar muls | Field arith | Total gates |
|--------------------|-------------|-------------|-------------|
| Original (4 ops)   | 6,513       | 0           | **6,513**   |
| α,β (2 muls)       | 5,111       | 5,122       | **10,233**  |

The α,β version is **57% more expensive**.  The reason:

1. **Non-native field arithmetic is expensive.**  α and β live in Fq (BN254
   base field), which is non-native in a BN254 circuit.  Computing them requires
   `bigfield` multiplication (CRT reduction + range checks) at ~2,500 gates per
   mul.  Even after precomputing constants to minimize witness-dependent ops
   (α = C0 - c0·z, β = c1·z - C1), the 2 bigfield muls still cost ~5,100 gates.

2. **Constant-scalar muls are cheap.**  In the original formulation, 3 of the 4
   group operations multiply a witness point by a **constant** scalar (s0^{-e},
   s1^{-e}, diff_inv — all deterministic from the domain).  `cycle_group`'s
   Straus implementation bakes constant scalars directly into the ROM table
   entries, avoiding the scalar decomposition and range-check overhead that
   witness scalars require.

3. **Witness-scalar muls are expensive.**  In the α,β version, both muls use
   witness scalars (α and β depend on the witness challenge z).  This forces
   full variable-base Straus with runtime scalar decomposition.

**Takeaway**: in the Grumpkin-in-BN254 circuit, optimizing the number of group
operations at the expense of introducing non-native field arithmetic is a bad
trade.  The bottleneck is the non-native field, not the number of group ops.

---

## Notes for integration

- **SRS generators**: In production, the group elements will come from the Aztec
  Grumpkin SRS, loaded via `srs::init_file_crs_factory` / `CommitmentKey<curve::Grumpkin>`.
  The current tests use random points for benchmarking; the gate count is
  independent of the specific point values.

- **ECFFT domain binary**: The log_n=18 domain data (~25 MB) is NOT checked into
  git.  The test generates it on first run via `ecfft_precompute.py`.  For CI,
  either pre-generate and cache the binary, or accept the ~2 minute generation time.

- **Origin tags**: The recursive verifier uses a "native hint" approach (runs the
  native transcript to extract values, then brings them into circuit as witnesses)
  to avoid origin tag conflicts.  When integrating with the full IPA verification
  flow, the transcript interaction should be refactored to use the stdlib transcript
  directly with proper origin tag propagation.
