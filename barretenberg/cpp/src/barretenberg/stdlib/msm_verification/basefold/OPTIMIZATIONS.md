# BaseFold Recursive Verifier: Optimization Analysis

This document analyzes the circuit cost of the BaseFold recursive verifier and
identifies concrete optimizations, ordered by impact.

## Baseline

Parameters: 2^15 MSM over Grumpkin, blowup factor 8, domain size 2^18,
18 fold rounds, 43 queries (~128-bit security).

Measured gate counts (from `basefold_circuit_cost.test.cpp`, isolated per-check):

| Component                       | Gates  |
|---------------------------------|--------|
| Fold check, e > 0 (4 muls)     | 6,513  |
| Fold check, e = 0 (2 muls)     | 5,183  |
| Merkle path, depth 18           | 1,407  |
| Merkle path, depth 1            | 149    |

**Baseline total: ~6.2M gates** (fold: ~5.4M, Merkle: ~0.8M).

For comparison, a raw `cycle_group::batch_mul` MSM of 2^15 points costs ~12M gates.

---

## Optimization 1: α,β reformulation (4 scalar muls → 2)

**Impact: ~2× on fold cost.  Estimated total: ~3.5M gates.**

The fold formula expands to a linear combination of the two opened group elements:

```
result = G_0 · α  +  G_1 · β
```

where α and β are **field elements** computable from domain constants and the
challenge z:

```
α = s_0^{-e} · (s_1 - z) / (s_1 - s_0)
β = s_1^{-e} · (z - s_0) / (s_1 - s_0)
```

Derivation:

```
a      = G_0 · s_0^{-e}
b      = G_1 · s_1^{-e}
slope  = (b - a) / (s_1 - s_0)
result = a + slope · (z - s_0)
       = G_0·s_0^{-e} + (G_1·s_1^{-e} - G_0·s_0^{-e}) · (z - s_0)/(s_1 - s_0)
       = G_0·[s_0^{-e} · (1 - (z-s_0)/(s_1-s_0))]  +  G_1·[s_1^{-e} · (z-s_0)/(s_1-s_0)]
       = G_0·[s_0^{-e} · (s_1-z)/(s_1-s_0)]  +  G_1·[s_1^{-e} · (z-s_0)/(s_1-s_0)]
```

In circuit: compute α and β using native-field arithmetic (a few muls and an
inverse — all cheap since s_0, s_1, e are constants and only z is a witness),
then do 2 Grumpkin scalar muls via `batch_mul({G_0, G_1}, {α, β})`.

The field arithmetic for α, β costs O(1) bigfield operations (~100-200 gates),
vs the current ~6,500 for 4 scalar muls.  So the fold cost roughly halves.

**This optimization has no protocol changes — it's purely an algebraic
rearrangement of the same verifier check.**

---

## Optimization 2: cross-round batching via random linear combination

**Impact: ~1.5× on top of Opt 1.  Estimated total: ~2.5–3.0M gates.**

Instead of checking each round's fold equation independently, compress all 18
checks per query into a single MSM using a random linear combination.

The verifier checks, for rounds r = 0..17:

```
F_r  =  P_r · α_r  +  Q_r · β_r
```

where P_r, Q_r are the opened pair at round r, and F_r is the fold result
(which is Merkle-authenticated as one of the opened elements at round r+1).
Introduce a random challenge ρ and check:

```
Σ_r  ρ^r · (F_r  -  P_r · α_r  -  Q_r · β_r)  =  O   (point at infinity)
```

This is a single MSM of up to 3×18 = 54 group elements (though the F_r overlap
with P_{r+1} or Q_{r+1}, so the actual count is ~36 distinct points).

**Key insight**: in the query trace, the fold result F_r at pair index j in
round r becomes one of the opened elements at round r+1.  Specifically, the
prover opens oracle[r+1] at position j (among others), and oracle[r+1][j] = F_r.
So F_r need not be sent separately — it is implicitly present as an opened
element in the next round.  The current protocol sends F_r redundantly; removing
this also saves proof size (2 Fr per query per round = 43 × 18 × 64 bytes ≈ 48 KiB).

The Straus algorithm in `cycle_group::batch_mul` amortizes the 256 doublings
(64 windows × 4 doublings) across all points.  With 36 points per MSM, the
doubling cost is negligible and the per-point marginal cost dominates:

```
Per point: ~370 (ROM table) + ~1,536 (lookups + additions) ≈ 1,900 gates
36 points: 256 + 36 × 1,900 ≈ 68,700 gates per query
43 queries: 43 × 68,700 ≈ 2.95M gates
```

**Protocol change: requires one additional Fiat-Shamir challenge (ρ) after all
openings are sent.**

---

## Optimization 3: cross-query random linear combination

**Impact: marginal on top of Opt 2.**

Take another random challenge σ and compress all 43 per-query checks into a
single MSM:

```
Σ_q  σ^q · [Σ_r  ρ^r · (F_r^{(q)}  -  P_r^{(q)} · α_r^{(q)}  -  Q_r^{(q)} · β_r^{(q)})]  =  O
```

This gives one MSM of 43 × 36 = 1,548 points.  The Straus doublings (256 gates)
are shared across all 1,548 points, but they were already cheap in Opt 2 (256
per query × 43 queries = 11,008 gates).  The per-point cost is unchanged.

Estimated: 256 + 1,548 × 1,900 ≈ 2.94M gates — essentially the same as Opt 2.

**This is not worth the added complexity.**  The doubling savings are negligible
at the batch sizes in Opt 2.  Skip this.

---

## Optimization 4: eliminate redundant fold result openings

**Impact: reduces proof size by ~48 KiB.  No effect on gate count.**

As noted in Opt 2, the fold result F_r is already opened as part of the next
round's pair.  The prover currently sends it separately as `prefix + "_fold"`.
Removing this redundancy saves 2 Fr elements per query per round:

```
Savings: 43 queries × 18 rounds × 2 Fr × 32 bytes = 49,536 bytes ≈ 48 KiB
Current proof:  ~605 KiB
Optimized proof: ~557 KiB
```

---

## Optimization 5: Merkle path deduplication

**Impact: reduces proof size significantly.  Modest gate savings.**

Multiple queries may share upper portions of their Merkle paths (especially in
later rounds with smaller trees).  A batch Merkle opening scheme (as in
Plonky2/FRI) deduplicates shared siblings.

Potential proof size savings: roughly 30-50% of Merkle path data, depending on
query collision patterns.  This is more impactful for proof size than gate count,
since the Merkle gates are only ~15% of the total.

---

## Optimization 6: reduce number of queries

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

With blowup 16 and Opt 1+2: 32 × 68,700 + Merkle ≈ **2.2M + 0.7M ≈ 2.9M gates**.

---

## Summary

| Configuration                                    | Fold gates | Merkle | Total   | Proof size |
|--------------------------------------------------|-----------|--------|---------|------------|
| Current (4 muls, isolated, blowup 8)            | 5.4M      | 0.8M   | **6.2M** | 605 KiB    |
| Opt 1: α,β reformulation                         | ~2.7M     | 0.8M   | **~3.5M** | 605 KiB    |
| Opt 1+2: + cross-round RLC                       | ~2.9M     | 0.8M   | **~3.0M** | 557 KiB    |
| Opt 1+2+6: + blowup 16                           | ~2.2M     | 0.7M   | **~2.9M** | ~450 KiB   |
| Raw batch_mul MSM (for comparison)               | —         | —      | **~12M**  | 0          |

All gate estimates above are approximate and should be validated by building the
actual circuits.  The per-point costs in `batch_mul` depend on whether the
scalars and base points are witnesses or constants, and on the specific Straus
implementation details in `cycle_group.cpp`.

The biggest single win is **Opt 1** (algebraic reformulation, no protocol change,
~2× improvement).  Opts 2 and 6 provide additional ~15-30% each.
