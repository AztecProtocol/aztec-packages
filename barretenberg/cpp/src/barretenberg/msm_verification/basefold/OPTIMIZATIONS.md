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
| **Total gates**               | **4,600,813** |
| **Log2(gates)**               | **22.13**     |
| Gates per query               | 106,995       |
| Gates per query per round     | 5,944         |
| Native proof size             | 605 KiB       |
| Raw batch_mul MSM (comparison)| ~12M gates    |
| **Improvement over raw MSM**  | **~2.6×**     |

Note: the Merkle path verification uses `conditional_assign` to compute BOTH
hash orderings at each level (needed for a fixed circuit — see PROBLEMS.md).
This doubles the Merkle hashing cost compared to a branching implementation.

### Cost breakdown per query per round

Each round for each query does:
1. **Fold check**: 4 group operations (3 constant-scalar muls + 1 witness-scalar mul)
2. **Merkle verification**: 2 paths, each of depth = (18 - round), with 2×
   Poseidon2 hashes per level (both orderings + conditional_assign)

Average Merkle depth across 18 rounds: (18 + 17 + ... + 1) / 18 = 9.5.
Average Merkle cost per round: 2 paths × (1 leaf hash + 9.5 × 2 path hashes) × ~74 gates ≈ 2,960 gates.
Average fold cost per round: 5,944 - 2,960 ≈ **2,984 gates**.

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
| 8      | 3         | 43      | 18     | 4.60M (measured)| 605 KiB    |
| 16     | 4         | 32      | 19     | ~3.6M           | ~470 KiB   |
| 32     | 5         | 26      | 20     | ~3.0M           | ~400 KiB   |

Trade-off: larger blowup → fewer queries (cheaper verifier) but larger initial
domain (more prover work, bigger precomputed domain data, one more fold round).
Since prover work is native and one-time, this favors the recursive setting.

### Optimization 2: single-hash Merkle paths (if witness-dependent topology is OK)

**Impact: ~1.1M gate savings (~24% of total).**

The current implementation computes BOTH Poseidon2 hash orderings at each Merkle
level and selects with `conditional_assign`.  If the domain lookup issue (see
PROBLEMS.md) is resolved via ROM tables, the Merkle index bits would be proper
circuit witnesses and we could use a single conditional hash instead of two.

This would bring the gate count back to ~3.5M.

### Optimization 3: paired Merkle paths

**Impact: reduces BOTH proof size (-254 KiB) AND gate count (~10-15% savings).**

The two openings per round are siblings at the bottom level of the Merkle tree.
Instead of 2 independent paths, send 1 common path from the parent to the root.
The verifier hashes both leaves to get the parent, then walks one shared path.

Saves: (d+1) Poseidon2 calls per round per query (or (d+1)×2 with the current
double-hash approach).

### Optimization 4: eliminate redundant fold result openings

**Impact: reduces proof size by ~48 KiB.  Small gate savings.**

The fold result F_r at round r is already opened as one of the pair elements
at round r+1.  Removing the redundant send saves 43 × 18 × 64 bytes ≈ 48 KiB.

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
   mul.

2. **Constant-scalar muls are cheap.**  In the original formulation, 3 of the 4
   group operations multiply a witness point by a **constant** scalar.
   `cycle_group`'s Straus implementation bakes constant scalars directly into
   ROM table entries.

3. **Witness-scalar muls are expensive.**  In the α,β version, both muls use
   witness scalars, forcing full variable-base Straus.

**Takeaway**: in the Grumpkin-in-BN254 circuit, optimizing the number of group
operations at the expense of introducing non-native field arithmetic is a bad
trade.  The bottleneck is the non-native field, not the number of group ops.

---

## Notes for integration

- **SRS generators**: In production, the group elements will come from the Aztec
  Grumpkin SRS, loaded via `srs::init_file_crs_factory` / `CommitmentKey<curve::Grumpkin>`.

- **ECFFT domain binary**: The log_n=18 domain data (~25 MB) is NOT checked into
  git.  The test generates it on first run via `ecfft_precompute.py` (~2 min).

- **Origin tags**: The recursive verifier uses a "native hint" approach to avoid
  origin tag conflicts.  Needs refactoring for production.

- **Fixed circuit**: See PROBLEMS.md for remaining witness-dependent topology
  issues and their estimated cost to fix (~300K additional gates).
