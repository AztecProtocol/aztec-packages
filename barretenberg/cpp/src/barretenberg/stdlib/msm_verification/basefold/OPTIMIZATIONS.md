# BaseFold Recursive Verifier: Cost Analysis

This document records the circuit cost of the BaseFold recursive verifier
and analyzes potential optimizations.

## Concrete measurement

Parameters: 2^15 MSM over Grumpkin, blowup factor 8 = 2^3, domain size 2^18,
18 fold rounds, 43 queries (~128-bit security).

Measured by `basefold_circuit_cost.test.cpp::FullSizeRecursiveVerifier`, which
builds the actual `RecursiveBaseFoldVerifier<UltraCircuitBuilder>` circuit:

| Metric                        | Value         |
|-------------------------------|---------------|
| **Total gates**               | **3,468,269** |
| **Log2(gates)**               | **21.73**     |
| Gates per query               | 80,657        |
| Gates per query per round     | 4,480         |
| Native proof size             | 605 KiB       |
| Raw batch_mul MSM (comparison)| ~12M gates    |
| **Improvement over raw MSM**  | **~3.5×**     |

### Cost breakdown per query per round

Each round for each query does:
1. **Fold check**: 4 group operations (3 constant-scalar muls + 1 witness-scalar mul)
2. **Merkle verification**: 2 paths, each of depth = (18 - round)

Average Merkle depth across 18 rounds: (18 + 17 + ... + 1) / 18 = 9.5.
Average Merkle cost per round: 2 paths × (1 leaf hash + 9.5 path hashes) × ~74 gates ≈ 1,554 gates.
Average fold cost per round: 4,480 - 1,554 ≈ **2,926 gates**.

The fold cost in a real circuit (~2,926 gates) is much lower than the isolated
measurement (~6,513 gates) because the per-circuit overhead (ROM table setup,
Straus initialization) amortizes across all fold checks in the same builder.

### Isolated per-operation costs (for reference only)

These were measured by constructing each operation in its own fresh circuit.
They significantly overestimate the cost in a real circuit:

| Component                       | Gates (isolated) |
|---------------------------------|------------------|
| Fold check, e > 0 (4 ops)      | 6,513            |
| Fold check, e = 0 (2 ops)      | 5,111            |
| Merkle path, depth 18           | 1,407            |
| Merkle path, depth 1            | 149              |

---

## Potential optimizations (circuit cost)

### Optimization 1: reduce number of queries (increase blowup)

**Impact: linear reduction in gates and proof size.  Easy to implement.**

| Blowup | Bits/query | Queries | Rounds | Estimated gates | Proof size |
|--------|-----------|---------|--------|----------------|------------|
| 8      | 3         | 43      | 18     | 3.47M (measured)| 605 KiB    |
| 16     | 4         | 32      | 19     | ~2.7M           | ~470 KiB   |
| 32     | 5         | 26      | 20     | ~2.3M           | ~400 KiB   |

Estimates assume: gates scale as (queries × rounds × cost_per_round), where
cost_per_round at blowup 16 is slightly higher (extra round, but smaller
average Merkle depth per extra round).  These estimates should be validated.

Trade-off: larger blowup → fewer queries (cheaper verifier) but larger initial
domain (more prover work, bigger precomputed domain data, one more fold round).
Since prover work is native and one-time, this favors the recursive setting.

### Optimization 2: paired Merkle paths

**Impact: reduces BOTH proof size (-254 KiB) AND gate count (~10% savings).**

The two openings per round are at indices j and j+half, which are siblings at
the bottom level of the Merkle tree.  Their two depth-d paths share d-1 sibling
nodes.

**Proof size savings**: send d-1 common siblings instead of 2×d (saves ~254 KiB,
see NATIVE_OPTIMIZATIONS.md).

**Gate count savings**: the verifier computes 2 leaf hashes + 1 parent hash +
(d-1) path hashes instead of 2 × (1 leaf hash + d path hashes).  This saves
d+1 Poseidon2 calls per round per query.  Average savings: ~10 × 74 ≈ 740 gates
per round per query → ~43 × 18 × 740 ≈ 573K gates (~16% of total).

### Optimization 3: eliminate redundant fold result openings

**Impact: reduces proof size by ~48 KiB.  Modest gate savings.**

The fold result F_r at round r is already opened as one of the pair elements
at round r+1.  Removing the redundant send saves:
- Proof: 43 × 18 × 64 bytes ≈ 48 KiB
- Gates: 43 × 18 × (2 field witnesses + 1 cycle_group witness) ≈ small

### Optimization 4: cross-round batching via random linear combination

**Estimated impact: marginal (~5%) on top of current amortization.**

Instead of checking each round's fold equation independently, compress all 18
checks per query into a single equation.  However, the concrete measurement
shows the fold cost per round is already ~2,926 gates (much less than the ~6,513
isolated measurement), indicating substantial amortization is already happening
within `cycle_group`'s Straus implementation.  Additional batching across rounds
would save mostly on ROM table construction (~370 gates per table × 4 tables
per round = ~1,480 gates, shared across 18 rounds = ~82 gates/round savings).

**Not worth the protocol complexity.**

---

## Potential optimizations (proof size only)

See NATIVE_OPTIMIZATIONS.md for detailed analysis.  Summary:

| Optimization                          | Proof size savings |
|---------------------------------------|-------------------|
| Remove redundant F_r                  | 48 KiB            |
| Paired Merkle paths                    | 254 KiB           |
| X-only group elements                  | 46 KiB            |
| Batch Merkle opening (FRI-style)       | ~70 KiB           |
| Increase blowup (fewer queries)        | proportional      |

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
We benchmarked this (isolated) and found:

| Formulation        | Scalar muls | Field arith | Total gates |
|--------------------|-------------|-------------|-------------|
| Original (4 ops)   | 6,513       | 0           | **6,513**   |
| α,β (2 muls)       | 5,111       | 5,122       | **10,233**  |

The α,β version is **57% more expensive**.  The reasons:

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
