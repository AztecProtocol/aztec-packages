# BaseFold Native Proof Size: Optimization Analysis

This document analyzes the native proof size of the BaseFold protocol and
identifies concrete optimizations to reduce it.

## Baseline

Parameters: 2^15 MSM over Grumpkin, blowup factor 8, domain size 2^18,
18 fold rounds, 43 queries (~128-bit security).

### Where the bytes go

```
Fixed:
  - 18 Merkle roots:                      18 × 32 =      576 bytes
  - 1 final group element (x, y):          2 × 32 =       64 bytes
  Fixed total:                                           640 bytes

Per query, per round r (oracle size 2^{18-r}, Merkle depth = 18-r):
  - 2 group element openings (P_r, Q_r):  2 × 64 =      128 bytes
  - 2 Merkle sibling paths:               2 × (18-r) × 32 bytes
  - 1 fold result (F_r):                      64 =        64 bytes
  Per round subtotal:                      192 + 64·(18-r) bytes

Per query total = Σ_{r=0}^{17} [192 + 64·(18-r)]
               = 18 × 192  +  64 × (18 + 17 + ... + 1)
               = 3,456  +  64 × 171
               = 14,400 bytes

43 queries × 14,400 = 619,200 bytes
Grand total: 640 + 619,200 = 619,840 bytes ≈ 605 KiB
```

### Breakdown by category

| Category            | Size     | Share |
|---------------------|----------|-------|
| Merkle paths        | 460 KiB  |  74%  |
| Group elements      | 148 KiB  |  24%  |
| Fixed (roots+final) | 0.6 KiB  |  <1%  |
| **Total**           | **605 KiB** | 100% |

Merkle paths dominate at 74% of the proof.

---

## Optimization 1: eliminate redundant fold results (-48 KiB)

The fold result F_r at pair index j in round r becomes oracle[r+1][j], which the
verifier already opens as one of the pair elements at round r+1.  Specifically,
when the query traces from round r to round r+1, the fold output at index j is
opened as P_{r+1} or Q_{r+1} in the next round's Merkle opening.

So F_r need not be sent separately — it is already present in the proof as an
opened element of round r+1.  The verifier just needs to know which element of
the next pair corresponds to the fold result (determined by the query index trace).

```
Savings: 43 queries × 18 rounds × 64 bytes = 49,536 bytes ≈ 48 KiB
```

**Result: ~557 KiB.**

This is a pure protocol simplification with no security impact.

---

## Optimization 2: paired Merkle paths (-206 KiB)

The two openings per round are at indices j and j + half, which are **siblings
at the bottom level** of the Merkle tree (they share the same parent).  Their
Merkle paths of depth d therefore share d-1 sibling nodes — only the bottom
sibling differs.

Instead of sending 2 independent paths (2 × d siblings), send:
- 1 common path from the parent to the root (d-1 siblings)
- the leaf-level sibling pair hash is implicit (the verifier computes it)

Total: (d-1) + 0 = d-1 siblings, plus the verifier hashes both leaves to get
the parent and then walks the common path.

Wait — more precisely: the two leaves hash to two leaf-hashes.  Their parent is
hash(leaf_hash_left, leaf_hash_right).  From the parent, the path to the root
has d-1 siblings.  So the optimized proof sends d-1 siblings (not 2×d).

```
Current Merkle per query:    Σ_{r=0}^{17} 2·(18-r)·32  =  10,944 bytes
Optimized per query:         Σ_{r=0}^{17} (18-r-1)·32   =  Σ_{r=0}^{17} (17-r)·32
                           = 32 × (17+16+...+0) = 32 × 153 = 4,896 bytes
Savings per query: 10,944 - 4,896 = 6,048 bytes
Total savings: 43 × 6,048 = 260,064 bytes ≈ 254 KiB
```

**Result: ~303 KiB** (after Opt 1+2).

This works because the protocol always opens pairs — it never opens a single
element in isolation.  The verifier already knows both leaf values (P_r, Q_r)
and can reconstruct the parent hash without any extra data.

---

## Optimization 3: x-only group elements (-50 KiB)

Each Grumpkin affine point is (x, y) = 64 bytes.  If the Merkle tree commits
to hash(x) instead of hash(x, y), the prover only needs to send x (32 bytes)
plus a sign bit for y.  The verifier recovers y from the curve equation:

```
y² = x³ + b      (b is the Grumpkin curve constant)
y = ±√(x³ + b)   (sign bit disambiguates)
```

In the native verifier this is a field square root + comparison (cheap).  In the
recursive verifier, it's a constraint y² = x³ + b (3 gates — essentially free).

After Opt 1 (eliminating F_r), each query opens 2 group elements per round:

```
Current: 43 × 18 × 2 × 64 = 98,304 bytes ≈ 96 KiB
X-only:  43 × 18 × 2 × 33 = 51,084 bytes ≈ 50 KiB  (32 bytes + 1 sign bit, rounded up)
Savings: ≈ 46 KiB
```

**Result: ~257 KiB** (after Opt 1+2+3).

Gate count impact: negligible.  The on-curve check (y² = x³ + b) costs 3 gates,
and Poseidon2(x) costs the same 73 gates as Poseidon2(x, y) (both fit in one
permutation).  The circuit cost benchmark confirmed hash(x,y) and hash(x-only)
give essentially identical gate counts.

---

## Optimization 4: batch Merkle opening (FRI-style, -50+ KiB)

When multiple queries open the same Merkle tree, their paths share upper-level
siblings.  A batch opening proof (as used in Plonky2 and standard FRI
implementations) deduplicates these shared nodes.

For q queries opening 2q leaves in a depth-d tree, the batch proof sends only
the minimal set of tree nodes needed to reconstruct all q roots:

```
Worst case (no sharing): 2q × d nodes
Best case (full sharing): 2q + d nodes
Expected for random queries: roughly 2q × d - (overlap savings)
```

For 86 leaves (43 queries × 2) in a depth-18 tree, the expected overlap at
level k is:

```
Probability two paths share a level-k node ≈ 86 / 2^{18-k}
Significant sharing begins at level k ≈ 18 - log2(86) ≈ 11
Levels 0-10: essentially no sharing (all 86 nodes unique)
Levels 11-18: increasing sharing, saving ~1 node per level per collision
```

Estimated savings: ~30% of Merkle path data in early rounds (large trees),
less in later rounds (trees are already small).

```
Estimated total Merkle after batch opening: ~140 KiB (vs ~210 KiB with Opt 2)
Additional savings: ~70 KiB
```

**Result: ~190 KiB** (after Opt 1+2+3+4).

This is more complex to implement (requires a batch Merkle proof structure)
but is well-understood from FRI implementations.

---

## Optimization 5: increase blowup factor

Blowup 16 (= 2^4) gives 4 bits of security per query, requiring only
128/4 = 32 queries instead of 43.  Trade-offs:

- Domain grows from 2^18 to 2^19 (one more fold round)
- Prover does 2× more work (larger oracle to commit)
- Query-proportional proof data shrinks by 32/43 ≈ 74%

```
Proof size with blowup 16 (after Opt 1+2+3): 32/43 × query_data + fixed
  ≈ 0.74 × (257 - 0.6) + 0.6 ≈ 190 KiB
```

**Result: ~190 KiB** (after Opt 1+2+3+5, comparable to Opt 4).

Blowup 32 (= 2^5): 26 queries, domain 2^20.  Further reduction to ~155 KiB
but prover overhead grows 4× and the domain precomputation becomes heavier.

---

## Summary

| Configuration                                 | Proof size | Savings from baseline |
|-----------------------------------------------|------------|----------------------|
| Baseline (blowup 8, 43 queries)              | **605 KiB** | —                    |
| + Opt 1: remove redundant F_r                | 557 KiB    | 48 KiB               |
| + Opt 2: paired Merkle paths                  | 303 KiB    | 302 KiB              |
| + Opt 3: x-only group elements                | 257 KiB    | 348 KiB              |
| + Opt 4: batch Merkle opening                  | ~190 KiB   | ~415 KiB             |
| + Opt 5: blowup 16 (32 queries)               | ~150 KiB   | ~455 KiB             |

Opts 1 and 2 are easy to implement and give the biggest bang (605 → 303 KiB).
Opt 3 is straightforward.  Opt 4 requires more implementation effort but is
standard FRI machinery.  Opt 5 is a parameter choice with prover cost trade-offs.

All optimizations are compatible with each other and with the recursive verifier
circuit optimizations described in OPTIMIZATIONS.md.
