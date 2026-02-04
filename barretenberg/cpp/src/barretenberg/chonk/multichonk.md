# Mega Honk Coefficient Interleaving

## TL;DR

| Metric | No Interleaving | Batch=4 |
|--------|-----------------|---------|
| Commitments per circuit | 55 | 15 |
| SRS size | n | 4n |
| ECCVM ops per fold | 62 | ~18 |
| Batching sumcheck work | O(6n) | O(24n) |
| Gemini rounds | log(n) | log(n) + 2 |

**Trade-off:** ~44 fewer ECCVM ops/fold for 4× batching sumcheck work.

**Note:** ECCVM cannot use interleaving (IPA-based).

### SRS Memory (BN254, 64 bytes/point)

| Circuit Size | Current SRS | With Batch=4 |
|--------------|-------------|--------------|
| 2^19 (practical max) | 32 MB | 128 MB |
| 2^20 | 64 MB | 256 MB |
| 2^21 | 128 MB | 512 MB |

For 2^19 circuits (current max across real kernels): 32 MB → 128 MB. Acceptable.

**Context:** A 2^20 circuit already has ≥1 GB peak memory during sumcheck, so +192 MB for SRS is negligible.

---

## 1. Core Idea: Interleaving

**Setup:** Vector of multilinear polynomials $(f_0, \ldots, f_{2^k-1})$ in $d$ variables. For batch=4: $k=2$.

### Multilinear Formulation

Add $k$ extra variables at the beginning:

$$F(X_0, \ldots, X_{d+k-1}) = \sum_{i=0}^{2^k-1} f_i(X_k, \ldots, X_{d+k-1}) \cdot L_i(X_0, \ldots, X_{k-1})$$

### Univariate Interpretation

$$U_{d+k}(F) = \sum_i U_d(f_i)(X^{2^k}) \cdot X^i$$

For $k=2$: `F(X) = f₀(X⁴) + X·f₁(X⁴) + X²·f₂(X⁴) + X³·f₃(X⁴)`

### Shifts

If $f_i(0,\ldots,0) = 0$, then $F$ is $2^k$-left-shiftable. Open shifts using:
- $[F] + \rho \cdot [F]/r^{2^k}$ and $[F] - \rho \cdot [F]/r^{2^k}$ at $\pm r$

**Protocol flow:**

**Critical:** $(u_0, \ldots, u_{k-1})$ must be derived AFTER $(u_k, \ldots, u_{d+k-1})$.

```
1. Sumcheck: d rounds → challenges u_k, ..., u_{d+k-1}
   Prover claims f_i(u_k, ...) before u_0, u_1 known

2. Gemini: log(n)+k rounds
   Standard gemini on the batched interleaved polys in d+k variables (verifier derived the batched eval from chunks).

3. Verifier checks: F(u_0, ..., u_{d+k-1}) = Σ f_i · L_i(u_0, ..., u_{k-1})
```

### Verifier Cost

$$\text{NUM\_COMMITS} + \text{CONST\_LOG\_N} \longrightarrow \frac{\text{NUM\_COMMITS}}{2^k} + \text{CONST\_LOG\_N} + k$$

### Why Interleaving, Not Concatenation

EBZ embeds size-$2^d$ poly into virtual dimension $d_v$: $\deg U_{d_v}(\widehat{w}) < 2^d$.

| Batching | Degree | Prover Work |
|----------|--------|-------------|
| Concatenation | $O(2^{d_v} \cdot 2^k)$ | Padded size |
| Interleaving | $O(2^d \cdot 2^k)$ | Actual size |

Interleaving: verifier circuit fixed at $d_v$, prover work scales with actual $d$.

---

## 2. Batching Constraints

Polynomials separated by Fiat-Shamir challenge cannot be batched.

---

## 3. Mega Honk Layout

```
PRECOMPUTED (31)    ─── freely batchable
ROUND 1 (16)        ─── before eta: w_l, w_r, w_o, ecc_op_wires, databus
         ↓ eta ↓
ROUND 2 (3)         ─── w_4, lookup_read_counts, lookup_read_tags
      ↓ beta, gamma ↓
ROUND 3 (4)         ─── inverses
ROUND 4 (1)         ─── z_perm
```

`w_4` cannot batch with `w_l, w_r, w_o` (depends on eta).

---

## 4. Batch Size Selection

| Batch | SRS | SRS Memory (2^19) | Commits |
|-------|-----|-------------------|---------|
| 1     | n   | 32 MB             | 55      |
| 2     | 2n  | 64 MB             | 29      |
| **4** | 4n  | **128 MB**        | **15**  |
| 8     | 8n  | 256 MB            | 8       |

Batch=4: Round 1 (16) and Round 3 (4) divide exactly. Memory acceptable.

---

## 5. Batching Layout

```
PRECOMPUTED (8 commits):
  VK₁: [q_m, q_c, q_l, q_r]
  VK₂: [q_o, q_4, q_busread, q_lookup]
  VK₃: [q_arith, q_delta_range, q_elliptic, q_memory]
  VK₄: [q_nnf, q_poseidon2_external, q_poseidon2_internal, sigma_1]
  VK₅: [sigma_2, sigma_3, sigma_4, id_1]
  VK₆: [id_2, id_3, id_4, table_1]
  VK₇: [table_2, table_3, table_4, lagrange_first]
  VK₈: [lagrange_last, lagrange_ecc_op, databus_id, ZERO]

ROUND 1 (4 commits):
  W₁: [ecc_op_wire_1, ecc_op_wire_2, ecc_op_wire_3, ecc_op_wire_4]
  W₂: [w_l, w_r, w_o, calldata]
  W₃: [calldata_read_counts, calldata_read_tags, secondary_calldata, secondary_calldata_read_counts]
  W₄: [secondary_calldata_read_tags, return_data, return_data_read_counts, return_data_read_tags]

ROUND 2: W₅: [w_4, lookup_read_counts, lookup_read_tags, ZERO]
ROUND 3: W₆: [lookup_inverses, calldata_inverses, secondary_calldata_inverses, return_data_inverses]
ROUND 4: W₇: [z_perm, ZERO, ZERO, ZERO]

TOTAL: 15 commits
```

---

## 6. Chunked MSM

```
C = Σⱼ Commit(pⱼ, SRSⱼ)   where SRSⱼ[i] = SRS[4i + j]
```

**Benefits:**
- Skip zero chunks (VK₈, W₅, W₇ → **5 MSMs saved**)
- Parallelize 4×size-n MSMs, better cache
- **Memory:** SRS must be 4n (preloaded), but Pippenger scratch stays n-sized (reused 4×)

**Memory breakdown for 2^19 circuits:**
- SRS: 128 MB (4× increase, must preload)
- Scratch: Same as current (n-sized, reused sequentially)
- Net: SRS grows 4×, working memory stays ~constant

---

## 7. CHONK/IVC Impact

- Batching sumcheck: 6 columns, cost O(6n) → O(24n) with interleaving
- Accumulators hold degree-4n polynomials
- Final opening: +2 Gemini rounds (paid once)
- ECCVM ops: 62 → ~18 per fold (**~44 fewer**)

---

## 8. Proof Size

| Component | Current | After | Savings |
|-----------|---------|-------|---------|
| Merge | 42 FEs | ~24 | -18 |
| ECCVM | 608 | ~600 | -8 |
| IPA | 64 | 60 | -4 |
| Translator | 786 | 0 | **-786** |
| **Total** | 1500 | ~684 | **-816** |

**~25 KB smaller proofs** (dominated by Translator elimination).

---

## 9. Long-term Strategy

```
Phase 1: Batch=4 → ~3.7× fewer ECCVM ops/fold
Phase 2: Halve ECCVM/Translator fixed sizes
Phase 3: Hiding-translator circuit (~198K gates) eliminates separate Translator proof
```

**ECCVM capacity:** 3.7× ≈ 2^1.9, so halving ECCVM still increases capacity:
- Current: 17 kernels at 2^15 ECCVM
- Phase 1+2: 17 × (3.7/2) ≈ **31 kernels** at 2^14 ECCVM

---

## 10. Pre-Implementation Benchmarks

| # | Component | Parameters | Why |
|---|-----------|------------|-----|
| 1 | MultilinearBatchingSumcheck | $2^{19}$ to $2^{22}$ | Validate 4× cost |
| 2 | Shplemini Decider | 2 polys, $2^{19}$ to $2^{21}$ | +2 Gemini rounds |
| 3 | ECCVM Proving | ~31 vs ~62 ops | Validate ~3.4× speedup |
| 4 | IPA Verification | log(n) vs log(n)-1 | Halved ECCVM benefit |
| 5 | Chunked MSM | 4×MSM(n) vs MSM(4n) | Parallelism benefit |
| 6 | Translator Bigfield | Halved op queue + last merge | Phase 3 feasibility |

---

## 11. Implementation Changes

### CommitmentKey
```cpp
std::array<std::span<G1>, 4> srs_views;  // srs_views[j][i] = srs[4*i + j]
```

### Shplemini Prover
- Gemini: log(n)+k rounds (first k rounds derive $u_0, \ldots, u_{k-1}$ for Lagrange eval)
- Shifts: use $[F] \pm \rho \cdot [F]/r^{2^k}$

### Shplemini Verifier
```cpp
// Lagrange basis for k=2
L_0 = (1-u_0)(1-u_1), L_1 = u_0(1-u_1), L_2 = (1-u_0)u_1, L_3 = u_0·u_1

// Batched eval
F(u) = Σ f_i(u) · L_i(u_0, u_1)
```

### Transcript
55 → 15 commits, log(n) → log(n)+2 Gemini rounds.

---

## 12. Implementation Checklist

- [ ] Extend SRS to 4n, add strided views
- [ ] Chunked MSM with zero-chunk skipping
- [ ] Oink: batch polynomials by round
- [ ] Gemini: log(n)+2 rounds
- [ ] Verifier: Lagrange-based claim batching
- [ ] Update transcript structure

---

## 13. Open Questions

1. **Merge → ECCVM consistency:** Interleaved comm shouldn't be hard to befriend with eccvm wires.

2. ~~**SRS constraints:**~~ Memory is fine (128 MB for 2^19 with batch=4).

3. **ZK masking:** For hiding kernel.

4. **Variable batch sizes:** For inhomogenous traces.

5. **Hiding-translator merge:**
   - Option A: Merge in Hiding Kernel relations?
   - Option B: Extra `ecc_final` columns + small merge proof
   - Either way, bigfield-translator needs fully merged op queue, subtle
