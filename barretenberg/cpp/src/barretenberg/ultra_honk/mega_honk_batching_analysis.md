# Mega Honk Coefficient Interleaving Analysis

> Analyzing batched polynomial commitments via coefficient interleaving for CHONK/IVC optimization.

## TL;DR

| Metric | No Interleaving | Batch=4 |
|--------|-----------------|---------|
| Commitments per circuit | 55 | 15 |
| SRS size | n | 4n |
| ECCVM ops per fold | 62 short scalar muls | ~18 short scalar muls |
| Batching sumcheck work | O(6n) | O(24n) (4×) |
| Batching sumcheck rounds | log(n) | log(n) + 2 |
| Final Gemini rounds | log(n) | log(n) + 2 |

**Verdict:** Trade ~44 ECCVM ops/fold for 4× batching sumcheck work. Likely worthwhile since batching sumcheck is fast and ECCVM is expensive.

**Note:** ECCVM itself cannot use interleaving (IPA-based). Only Mega Honk benefits.

---

## 1. Core Idea

Interleave coefficients of k polynomials into one:

```
P(X) = p₀(Xᵏ) + X·p₁(Xᵏ) + X²·p₂(Xᵏ) + ... + Xᵏ⁻¹·pₖ₋₁(Xᵏ)
```

Single commitment to P replaces k individual commitments.

---

## 2. Constraint: Challenge Boundaries

**Polynomials separated by a Fiat-Shamir challenge cannot be batched.**

The challenge depends on prior commitments, so polynomials committed after the challenge cannot be interleaved with those committed before.

---

## 3. Mega Honk Polynomial Layout

```
PRECOMPUTED (31 polys) ─── no challenge dependency, freely batchable
    Selectors (15): q_m, q_c, q_l, q_r, q_o, q_4, q_busread, q_lookup,
                    q_arith, q_delta_range, q_elliptic, q_memory, q_nnf,
                    q_poseidon2_external, q_poseidon2_internal
    Sigmas (4):     sigma_1..4
    IDs (4):        id_1..4
    Tables (4):     table_1..4
    Lagrange (3):   lagrange_first, lagrange_last, lagrange_ecc_op
    Other (1):      databus_id

WITNESS ROUND 1 (16 polys) ─── before eta
    w_l, w_r, w_o, ecc_op_wire_1..4, 9× databus entities

                         ↓ eta challenge ↓

WITNESS ROUND 2 (3 polys) ─── w_4 depends on eta (memory records)
    w_4, lookup_read_counts, lookup_read_tags

                      ↓ beta, gamma challenges ↓

WITNESS ROUND 3 (4 polys)
    lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses

WITNESS ROUND 4 (1 poly)
    z_perm
```

**Key insight:** `w_4` cannot batch with `w_l, w_r, w_o` — it depends on eta for memory record computation.

---

## 4. Why Batch=4?

| Batch Size | SRS | Precomputed Commits | Witness Commits | Total |
|------------|-----|---------------------|-----------------|-------|
| 1 (none)   | n   | 31                  | 24              | 55    |
| 2          | 2n  | 16                  | 13              | 29    |
| **4**      | **4n** | **8**            | **7**           | **15** |
| 8          | 8n  | 4                   | 4               | 8     |

Batch=4 hits the sweet spot:
- Round 1 (16 polys) divides exactly → 4 batches
- Round 3 (4 polys) divides exactly → 1 batch
- Precomputed (31 polys) → 8 batches (1 padding)
- Acceptable SRS increase (4×)

---

## 5. Recommended Batching Layout

```
PRECOMPUTED (8 interleaved commitments):
  VK₁: [q_m, q_c, q_l, q_r]
  VK₂: [q_o, q_4, q_busread, q_lookup]
  VK₃: [q_arith, q_delta_range, q_elliptic, q_memory]
  VK₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, sigma_1]
  VK₅: [sigma_2, sigma_3, sigma_4, id_1]
  VK₆: [id_2, id_3, id_4, table_1]
  VK₇: [table_2, table_3, table_4, lagrange_first]
  VK₈: [lagrange_last, lagrange_ecc_op, databus_id, ZERO]

ROUND 1 (4 interleaved commitments):
  W₁: [w_l, w_r, w_o, ecc_op_wire_1]
  W₂: [ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4, calldata]
  W₃: [calldata_read_counts, calldata_read_tags, secondary_calldata, secondary_calldata_read_counts]
  W₄: [secondary_calldata_read_tags, return_data, return_data_read_counts, return_data_read_tags]

ROUND 2 (1 interleaved commitment):
  W₅: [w_4, lookup_read_counts, lookup_read_tags, ZERO]

ROUND 3 (1 interleaved commitment):
  W₆: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]

ROUND 4 (1 interleaved commitment):
  W₇: [z_perm, ZERO, ZERO, ZERO]

TOTAL: 15 commitments (down from 55)
```

---

## 6. Chunked MSM Implementation

Commit to interleaved polynomial by summing chunk commitments:

```
C = Commit(p₀, SRS₀) + Commit(p₁, SRS₁) + Commit(p₂, SRS₂) + Commit(p₃, SRS₃)

where SRS_j = [τʲG, τ^(4+j)G, τ^(8+j)G, ...] = strided view of full SRS
```

### Benefits
- **Skip zero chunks:** If p_j = 0, skip that MSM entirely
- **Parallelization:** 4 independent size-n MSMs vs 1 size-4n MSM
- **Cache efficiency:** Smaller working sets

### SRS View Precomputation

At commitment key setup, extract 4 contiguous views:

```cpp
// Precompute strided views for efficient chunked MSM
for (size_t j = 0; j < 4; j++) {
    for (size_t i = 0; i < n; i++) {
        srs_view[j][i] = srs[4*i + j];
    }
}
```

Same total memory (4n points), optimal memory layout for MSMs.

### Zero-Chunk Savings

| Batch | Content | Zero Chunks Skipped |
|-------|---------|---------------------|
| VK₈   | [..., databus_id, ZERO] | 1 |
| W₅    | [w_4, lookup_*, ZERO] | 1 |
| W₇    | [z_perm, ZERO, ZERO, ZERO] | 3 |
| **Total** | | **5 MSMs saved** |

---

## 7. Protocol Flow Comparison

### Without Interleaving

```
1. Oink:     Commit to 55 polynomials
2. Sumcheck: log(n) rounds, outputs 55 evaluation claims v_i = p_i(r)
3. Gemini:   log(n) fold rounds, log(n) fold commitments
4. Shplonk:  Batch 55 openings
5. KZG:      Single pairing check
```

### With Interleaving (Batch=4)

```
1. Oink:     Commit to 15 interleaved polynomials
2. Sumcheck: log(n) rounds, outputs 55 evaluation claims (unchanged)
3. Gemini:   log(4n) = log(n)+2 fold rounds
             First 2 folds "de-interleave":
               Fold 1: P'(X) = (p₀ + ρ₁·p₁)(X²) + X·(p₂ + ρ₁·p₃)(X²)
               Fold 2: P''(X) = p₀(X) + ρ₁·p₁(X) + ρ₂·p₂(X) + ρ₁ρ₂·p₃(X)
             Remaining log(n) folds as usual
4. Shplonk:  Batch 15 openings
5. KZG:      Single pairing check
```

---

## 8. CHONK/IVC Considerations

### Why Proof Size Stays Similar

In CHONK:
- Polynomials are folded into accumulators during IVC
- **Only opened once at the very end**
- No per-circuit opening overhead

```
Without interleaving: 55 commits/circuit → fold → 1 opening (degree n)
With interleaving:    15 commits/circuit → fold → 1 opening (degree 4n)
```

The degree-4n opening costs 2 extra Gemini rounds, paid once.

### Multilinear Batching Sumcheck Cost

The `MultilinearBatchingSumcheck` reduces two accumulator claims (at different points) to a single claim. It operates on a **fixed-width circuit of 6 columns**:

```
Columns:
- batched_unshifted_accumulator, batched_unshifted_instance  (2)
- batched_shifted_accumulator, batched_shifted_instance      (2)
- eq_accumulator = eq(X, r_acc)                              (1)
- eq_instance = eq(X, r_inst)                                (1)
```

The cost depends on **polynomial size**, not number of original polynomials:

| | Without Interleaving | With Interleaving |
|--|---------------------|-------------------|
| Batched poly size | n | 4n |
| Variables | log(n) | log(n) + 2 |
| Sumcheck width | 6 columns | 6 columns |
| **Work per fold** | **O(6n)** | **O(24n)** |
| Rounds | log(n) | log(n) + 2 |

**4× more batching sumcheck work per fold**, plus 2 extra rounds (round polynomials to send).

Note: This sumcheck is currently fast relative to other operations, so the 4× increase may be acceptable given the commitment savings.

### Accumulator Size

With interleaving, accumulators hold degree-4n polynomials:
- Each fold carries larger commitments
- Folding operation itself unchanged (still group additions)
- Final opening: log(n)+2 Gemini rounds instead of log(n)

---

## 9. ECCVM Impact

The recursive verifier batches commitments via scalar muls → these go to ECCVM op queue.

```
Without interleaving:
  Verifier batches 55+1 unshifted + 5+1 shifted = 62 short scalar muls → ECCVM

With interleaving (batch=4):
  Verifier batches ~14+1 unshifted + ~2+1 shifted = ~18 short scalar muls → ECCVM
```

**~44 fewer ECCVM rows per fold.**

Note: ECCVM itself cannot use interleaving (IPA-based, would blow up proof size).

---

## 10. Cost-Benefit Summary

### Savings (per fold)
- ~44 fewer scalar muls in ECCVM op queue (62 → ~18)
- ECCVM circuit shrinks proportionally
- Smaller transcript / proof size (40 fewer G1 points)

### Costs (per fold)
- 4× more batching sumcheck work (O(6n) → O(24n))
- 2 extra sumcheck rounds (log(n) → log(n)+2)

### One-time Costs
- 4× SRS size requirement
- 2 extra Gemini rounds at final opening

### Trade-off

```
Per fold:
  Saved:  ~44 ECCVM rows (scalar mul ops)
  Cost:   18n extra sumcheck work

Break-even: If 44 ECCVM rows > 18n sumcheck ops (in prover time)
```

The batching sumcheck is currently fast. ECCVM is expensive. This trade favors interleaving.

### When It Makes Sense

- **ECCVM-bound workloads**: Reducing ECCVM size is high value
- **Long IVC chains**: Savings compound, one-time costs amortized
- **Proof size matters**: 40 fewer G1 points per circuit

---

## 11. Proof Size Impact

Current Chonk proof size (from pinning tests):

```
MERGE_PROOF_SIZE              =   42 FEs
ECCVMFlavor::PROOF_LENGTH     =  608 FEs
IPA_PROOF_LENGTH              =   64 FEs
TranslatorFlavor::PROOF_LENGTH=  786 FEs
────────────────────────────────────────
Goblin total                  = 1500 FEs

ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS = 1907 FEs
```

### Savings Breakdown

| Component | Current (FEs) | After (FEs) | Savings | Notes |
|-----------|---------------|-------------|---------|-------|
| Merge | 42 | ~24 | -18 | 4+4+4 wire comms → 1+1+1 interleaved |
| ECCVM | 608 | ~600 | -8 | Only log-dependent parts shrink |
| IPA | 64 | 60 | -4 | log(n) reduction from halved ECCVM |
| Translator | 786 | 0 | -786 | **Eliminated entirely** |
| **Goblin total** | **1500** | **~684** | **-816** | |

Hiding Kernel proof grows slightly (+198K gates → +1-2 sumcheck rounds).

### Net Result

**~800 FEs × 32 bytes ≈ 25-26 KB smaller proofs**

The dominant saving is Translator elimination (786 FEs = ~25 KB).

---

## 12. Long-term Strategy

```
Phase 1: Batch=4 for CHONK
    └── ~3.7× fewer ECCVM/Translator rows (62 → ~18 ops/fold)

Phase 2: Halve fixed circuit sizes
    ├── Halve Translator fixed size
    │   └── Smaller op queue → smaller Translator circuit
    └── Halve ECCVM fixed size
        └── Faster IPA proving
        └── Faster native IPA verification

Phase 3: Replace Translator with hiding-translator circuit
    └── Bigfield (~165K) + interleaving overhead (~33K) = ~198K gates
    └── Glue to Hiding Kernel
    └── Can use batch=2 or batch=4 interleaving
    └── Eliminates separate Translator proof
```

**End state:**
- Hiding-translator circuit (~198K) handles BN254↔Grumpkin bridging inline
- ECCVM half the size → faster IPA proving & verification
- Translator eliminated as separate proof

---

## 13. Implementation Checklist

- [ ] Extend SRS/commitment key to 4n
- [ ] Implement strided SRS view precomputation
- [ ] Modify Oink prover to batch polynomials by round
- [ ] Add chunked MSM with zero-chunk skipping
- [ ] Update Gemini to handle degree-4n polynomials
- [ ] Adjust batching sumcheck for new polynomial structure
- [ ] Update transcript structure (15 commitments instead of 55)
- [ ] Verifier changes for structured claim batching

---

## 14. Open Questions

1. **Merge → ECCVM consistency with interleaved op queue?**
   ECCVM needs 4 separate wire evaluations for EC op verification.
   Options: de-interleave at handoff, modify ECCVM input format, or keep final merge using separate wires.

2. **Optimal batch size for specific SRS constraints?**
   If SRS is limited, batch=2 is fallback (29 commits, 2× SRS).

3. **Interaction with ZK masking?**
   Masking polynomials need compatible batching.

4. **Recursion circuit impact?**
   Verifier circuit for interleaved proofs may differ.

5. **Variable batch sizes per round?**
   Could use batch=4 for Round 1 (16 polys) but batch=3 for Round 2 (3 polys) to minimize padding.
