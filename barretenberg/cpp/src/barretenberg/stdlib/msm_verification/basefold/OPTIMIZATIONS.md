# BaseFold Recursive Verifier: Optimization Analysis

This document analyzes the circuit cost of the BaseFold recursive verifier and
identifies concrete optimizations, ordered by impact.

## Baseline

Parameters: 2^15 MSM over Grumpkin, blowup factor 8, domain size 2^18,
18 fold rounds, 43 queries (~128-bit security).

Measured gate counts (from `basefold_circuit_cost.test.cpp`, isolated per-check):

| Component                       | Gates  |
|---------------------------------|--------|
| Fold check, e > 0 (4 ops)      | 6,513  |
| Fold check, e = 0 (2 ops)      | 5,111  |
| Merkle path, depth 18           | 1,407  |
| Merkle path, depth 1            | 149    |

**Baseline total: ~6.2M gates** (fold: ~5.4M, Merkle: ~0.8M).

For comparison, a raw `cycle_group::batch_mul` MSM of 2^15 points costs ~12M gates.

---

## Why the α,β reformulation does NOT help

The fold formula can be rewritten as `result = G_0·α + G_1·β` where α, β are
field elements depending on domain constants and the challenge z.  Algebraically
this looks like 2 scalar muls instead of 4.

**However, benchmarking shows this is SLOWER (~10,200 gates vs ~6,500).**

The reason: α and β live in Fq (BN254 base field = Grumpkin scalar field),
which is a **non-native field** in the BN254 circuit.  Computing α, β requires
`bigfield` arithmetic (~5,100 gates for 2 constant×witness muls + subs).
Meanwhile, the scalar muls themselves become more expensive because α, β are
witness bigfield values, forcing variable-base Straus with witness scalars.

The original 4-operation formulation is better because:
- 3 of the 4 scalar muls use **constant** scalars (s0^{-e}, s1^{-e}, diff_inv)
  which cycle_group handles cheaply (the scalar is baked into the ROM table)
- Only 1 mul uses a witness scalar ((z - s0), the challenge-dependent part)
- No bigfield arithmetic is needed — the constant scalars are just native Fq values

**Lesson: in the Grumpkin-in-BN254 circuit setting, constant-scalar group muls
are much cheaper than witness-scalar muls + bigfield arithmetic.  Reducing the
number of group operations is only a win if it doesn't introduce non-native
field arithmetic.**

---

## Optimization 1: cross-round batching via random linear combination

**Impact: estimated ~1.5× on fold cost.  Estimated total: ~4.0–4.5M gates.**

Instead of checking each round's fold equation independently, compress all 18
checks per query into a single equation using a random linear combination.

The verifier checks, for rounds r = 0..17:

```
F_r  =  fold(P_r, Q_r, z_r, d_r)
```

where P_r, Q_r are the opened pair at round r, and F_r is the fold result.
Introduce a random challenge ρ and check:

```
Σ_r  ρ^r · (F_r  -  fold(P_r, Q_r, z_r, d_r))  =  O   (point at infinity)
```

This allows batching all the group operations across rounds.  Instead of 18
independent fold checks (each allocating its own ROM tables in Straus), the
verifier can collect all the scalar-mul pairs and evaluate them in fewer
`batch_mul` calls, amortizing ROM table construction and Straus doublings.

**Key insight**: in the query trace, the fold result F_r at pair index j in
round r becomes one of the opened elements at round r+1.  Specifically, the
prover opens oracle[r+1] at position j, and oracle[r+1][j] = F_r.  So F_r
need not be sent separately — it is implicitly present as an opened element
in the next round.  The current protocol sends F_r redundantly; removing
this also saves proof size (2 Fr per query per round = 43 × 18 × 64 ≈ 48 KiB).

**Protocol change: requires one additional Fiat-Shamir challenge (ρ) after all
openings are sent.**

The exact gate savings depend on how well `batch_mul` amortizes across the
batched operations.  The main savings come from:
- Sharing the 256 Straus doublings across all muls in the batch
- Potentially reusing ROM tables for points that appear in multiple rounds
  (though our witness points are all distinct, so this may not apply)

---

## Optimization 2: eliminate redundant fold result openings

**Impact: reduces proof size by ~48 KiB.  No effect on gate count.**

As noted in Opt 1, the fold result F_r is already opened as part of the next
round's pair.  The prover currently sends it separately as `prefix + "_fold"`.
Removing this redundancy saves 2 Fr elements per query per round:

```
Savings: 43 queries × 18 rounds × 2 Fr × 32 bytes = 49,536 bytes ≈ 48 KiB
Current proof:  ~605 KiB
Optimized proof: ~557 KiB
```

---

## Optimization 3: Merkle path deduplication

**Impact: reduces proof size significantly.  Modest gate savings.**

Multiple queries may share upper portions of their Merkle paths (especially in
later rounds with smaller trees).  A batch Merkle opening scheme (as in
Plonky2/FRI) deduplicates shared siblings.

Potential proof size savings: roughly 30-50% of Merkle path data, depending on
query collision patterns.  This is more impactful for proof size than gate count,
since the Merkle gates are only ~15% of the total.

---

## Optimization 4: reduce number of queries

**Impact: linear reduction in both gates and proof size.**

The number of queries is `λ / log2(blowup)` where λ is the security parameter.
With blowup 8 (3 bits/query): 128/3 ≈ 43 queries.

Alternatives:
- Blowup 16 (4 bits/query): 32 queries, but 19 rounds (one more), domain 2^19
- Blowup 32 (5 bits/query): 26 queries, 20 rounds, domain 2^20

The trade-off: more blowup → fewer queries (less verifier work) but larger
initial domain (more prover work, larger precomputed domain data).  Since prover
work is native and one-time (the SRS encoding), and verifier work is in-circuit,
increasing blowup is generally favorable for the recursive setting.

With blowup 16: 32 queries × ~143K gates/query ≈ **4.6M gates** (vs 6.2M).

---

## Summary

| Configuration                            | Fold   | Merkle | Total    | Proof size |
|------------------------------------------|--------|--------|----------|------------|
| Current (4 ops, isolated, blowup 8)     | 5.4M   | 0.8M   | **6.2M** | 605 KiB    |
| + Opt 1: cross-round RLC batching        | ~3.5M? | 0.8M   | **~4.3M?** | 557 KiB |
| + Opt 4: blowup 16 (32 queries)          | ~2.6M? | 0.6M   | **~3.2M?** | ~450 KiB |
| Raw batch_mul MSM (for comparison)       | —      | —      | **~12M** | 0          |

Gate estimates for Opt 1 and 4 are projections that need validation by building
the actual batched circuit.  The per-point costs in `batch_mul` depend on whether
the scalars and base points are witnesses or constants, and on the specific Straus
implementation details in `cycle_group.cpp`.

### What does NOT help (surprising finding)

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
