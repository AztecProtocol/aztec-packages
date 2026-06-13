# BN254 Multi-Scalar Multiplication — Design Analysis

> **Scope.** End-to-end technical reference for the WebGPU MSM implementation in
> [`barretenberg/ts/src/msm_webgpu/`](.) and the Barretenberg WASM Pippenger it
> is positioned against. Covers algorithm, code structure, measured profile,
> ranked optimization roadmap, and a closing analysis of two specialized
> scalar distributions (small-scalar and sparse-scalar). Intended as a
> source-of-truth for design and resourcing decisions.
>
> All claims are cross-checked against the source tree as of this writing.
> Where a claim could not be verified, it is explicitly flagged.

---

## 0. Executive Summary

Bullet points first; full details below.

* **Where we are.** WebGPU MSM at $n = 2^{16}$ matches WASM-MT (75 ms vs 77 ms), and at $n = 2^{20}$ is 2.06× faster than WASM-MT (397 ms vs 816 ms). The win grows with $n$ because fixed costs amortize.
* **Where the GPU time goes.** Two stages dominate. At $n = 2^{16}$, BPR-1 is **37 %** of GPU wall (29 ms of 80). At $n = 2^{20}$, `ba_inverse` is **47 %** of GPU wall (175 ms of 374). BPR-1 cost is **flat** in $n$; `ba_inverse` is **linear** in $n$.
* **Highest-leverage optimizations** (ranked, with predicted wins):
  1. `bpr_inner_loop = "mixed_safe" / "assume_affine"` — already in the library, not yet flipped on. ~8 / ~13-25 ms at $n=2^{16}$ (10 / 25 % on the wall). Zero algorithmic risk for `mixed_safe`.
  2. Investigate `ba_inverse` parallelism budget. Owns nearly half of GPU time at $n=2^{20}$ and the parallel multi-workgroup kernel already exists. Tuning `NUM_SUB_WGS` is the most promising 2$\times$-class lever for large $n$.
  3. **GLV / endomorphism decomposition.** BN254 has an order-3 endomorphism $\phi$ with $\phi(P) = [\lambda]P$. Splitting $s = s_1 + \lambda s_2$ with $|s_i| \approx 2^{128}$ halves $T$ (subtask count) for SRS-cached bases. Wins everywhere. Neither implementation uses it.
  4. Hide CPU `writeBuffer(scalars)` (\~15 ms at $n=2^{20}$) behind the previous dispatch's GPU work — currently a serial gap.
  5. Roofline `ba_apply` (BW vs compute bound) to pick between SoA layout improvements and limb-width reduction.
* **Specialized distributions.**
  * **32-bit scalars** halve subtask count $T$ (8 → 4) and shrink BPR-1 cost proportionally; total wall at $n=2^{16}$ drops from 75 ms to **≈40 ms** modelled.
  * **90 % zero scalars** with 10 % small values produce a sparsity-dominated regime where the *current* WebGPU pipeline gains almost nothing (every kernel still iterates over $n$). A sparse front-end (zero-filter compaction prior to decompose) is the single change that would convert this distribution into a $\sim 10\times$ win.

---

## 1. Notation

| Symbol | Meaning |
|---|---|
| $\mathbb{F}_q$ | BN254 base field; $\log_2 q \approx 254$. |
| $\mathbb{F}_r$ | BN254 scalar field; $\log_2 r \approx 254$ (precisely 253.77). |
| $\mathbb{G}_1$ | BN254 group of order $r$ over $\mathbb{F}_q$, equation $y^2 = x^3 + 3$. |
| $n$ | Number of (point, scalar) pairs in the MSM. |
| $\lambda$ | Scalar bit length (`scalar_bit_length`). Default $\lambda = 254$; 32-bit case $\lambda=32$; GLV case $\lambda=128$. |
| $c$ | Window / chunk size in bits (`chunk_size`). |
| $T$ | Number of windows / subtasks; $T = \lceil \lambda / c \rceil$. |
| $B$ | Bucket count per window; $B = 2^{c-1}$ with signed digits, $2^c$ unsigned. |
| $P_i$ | Base points, $i \in [0, n)$. |
| $s_i$ | Scalars, $s_i \in \mathbb{F}_r$. |
| $S$ | MSM result, $S = \sum_{i=0}^{n-1} [s_i] P_i$. |
| $s_{i,j}$ | $j$-th window of $s_i$, $j \in [0, T)$. |
| $\phi$ | Order-3 endomorphism on $\mathbb{G}_1$, $\phi(x,y) = (\beta x, y)$. |
| $\lambda_\phi$ | Eigenvalue: $\phi(P) = [\lambda_\phi] P$ in the order-$r$ subgroup. |
| $w$ | Field-limb width (WASM 29; native 64; WebGPU 13). |
| $L$ | Field-limb count, $L = \lceil 254 / w \rceil$ (WASM 9; native 4; WebGPU 20). |
| $R$ | Montgomery radix, $R = 2^{Lw} \bmod q$. |
| $|M|$ | Cost of one $\mathbb{F}_q$ multiply. |
| $|I|$ | Cost of one $\mathbb{F}_q$ inversion; in Barretenberg's model $|I| \approx 332|M|$ (see §5.6). |

The MSM problem statement:
$$ S \;=\; \sum_{i=0}^{n-1} [s_i] P_i, \qquad s_i \in \mathbb{F}_r,\; P_i \in \mathbb{G}_1. $$

---

## 2. Pippenger's Algorithm — Reference

Standard windowed Pippenger expressed in our notation. Decompose each scalar into $T$ windows of $c$ bits:
$$ s_i \;=\; \sum_{j=0}^{T-1} s_{i,j}\, 2^{jc}, \quad s_{i,j} \in [0, 2^c). $$

The MSM then becomes a sum of *per-window partial MSMs* $W_j$:
$$ S \;=\; \sum_{j=0}^{T-1} 2^{jc}\, W_j, \qquad W_j \;=\; \sum_{i=0}^{n-1} [s_{i,j}] P_i. $$

Each $W_j$ is computed in three sub-phases:

1. **Bucketing.** Group base points by their digit value:
$$ B_{j,k} \;=\; \sum_{i \,:\, s_{i,j} = k} P_i, \quad k \in [1, 2^c). $$
2. **Suffix-sum reduction** (per window):
$$ W_j \;=\; \sum_{k=1}^{2^c - 1} k \cdot B_{j,k} \;=\; \sum_{k=1}^{2^c-1} \big(B_{j,k} + B_{j,k+1} + \cdots + B_{j,2^c-1}\big). $$
3. **Horner combination across windows:**
$$ S \;=\; \big(\cdots\big((W_{T-1}) \cdot 2^c + W_{T-2}\big) \cdot 2^c + \cdots + W_0\big). $$

Costs:
* Bucketing: $n$ group adds per window, $T n$ total.
* Reduction: $\approx 2 \cdot 2^c$ adds per window (one for the running sum $m$ and one for the accumulator $g$).
* Horner: $T - 1$ rounds of $c$ doublings + 1 add = $c(T-1)$ doublings + $T-1$ adds.

The classical cost optimum minimizes $Tn + T 2^c$ in $c$, giving $c \approx \log_2 n - \log_2 \log_2 n$.

### Signed-digit refinement

Both implementations actually use **signed buckets**: $s_{i,j} \in [-2^{c-1}, 2^{c-1})$ after a carry through the windows. This halves $B$ to $2^{c-1}$. The carry is implicit when $s_{i,j} \geq 2^{c-1}$: rewrite $s_{i,j} = -(2^c - s_{i,j})$ and increment $s_{i,j+1}$. Bucket index for the negative branch flips $P_i \to -P_i$, which is free in affine coordinates ($y \to -y$).

---

## 3. The Barretenberg WASM Pippenger

Located in [`barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/).

### 3.0 Top-level dataflow

```
   ┌──────────────────────────────────────────────────────────────┐
   │   inputs:  n scalars  (Fr, 254 bits)                         │
   │            n base points  (G_1 affine, 2 × 254 bits each)    │
   └──────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
       ┌──────────────────────────────────────────────────────┐
       │  compute_scalar_slice_weights:                       │
       │    for each scalar i, weight                         │
       │       w_i = ceil(λ_i / c) + 4                        │
       │    (4 = FIXED_PER_SCALAR_WEIGHT)                     │
       └──────────────────────────────┬───────────────────────┘
                                      ▼
       ┌──────────────────────────────────────────────────────┐
       │  partition_by_weight:                                │
       │    greedy split into K = #threads work units         │
       │    so cumulative weight per unit ≈ Σ w_i / K         │
       │    (work unit = contiguous index range)              │
       └──────────────────────────────┬───────────────────────┘
                                      │
                                      │  K MSMWorkUnits
                                      ▼
       ┌───────────────────────────────────────────────────────┐
       │       parallel_for over K work units                  │
       │       (mutex-pool pthreads on wasm-threads;           │
       │        std::thread + pool on native)                  │
       │                                                       │
       │   ┌────────────┐ ┌────────────┐     ┌────────────┐    │
       │   │ thread 0   │ │ thread 1   │ ... │ thread K-1 │    │
       │   │   runs     │ │   runs     │     │   runs     │    │
       │   │ FULL       │ │ FULL       │     │ FULL       │    │
       │   │ Pippenger  │ │ Pippenger  │     │ Pippenger  │    │
       │   │ on its     │ │ on its     │     │ on its     │    │
       │   │ slice      │ │ slice      │     │ slice      │    │
       │   │ (see       │ │ (see       │     │ (see       │    │
       │   │  §3.1)     │ │  §3.1)     │     │  §3.1)     │    │
       │   └─────┬──────┘ └─────┬──────┘     └─────┬──────┘    │
       │         │              │                  │           │
       │         ▼              ▼                  ▼           │
       │       S_0            S_1                S_{K-1}       │
       └───────────┬─────────────┬────────────────┬────────────┘
                   │             │                │
                   └─────────────┼────────────────┘
                                 ▼
                       ┌────────────────────┐
                       │  G_1 sum across    │
                       │  partials:         │
                       │  S = Σ S_k         │
                       └─────────┬──────────┘
                                 ▼
                                 S
```

**Key design choice — partition by points, not by windows.** Each thread runs the *full* Pippenger algorithm (all $T$ rounds, all $B$ buckets) on a contiguous slice of the input. Threads do *not* share the bucket array; each has its own copy. This avoids atomic contention on bucket writes, at a memory cost of $K \times B \times 64$ bytes for affine buckets (e.g. at $K = 32$, $c = 14$: $\approx 16$ MiB). The final reduction is $K - 1$ G$_1$ additions in $\mathbb{G}_1$ — negligible.

### 3.1 Algorithm structure

Window size is **chosen per call** by brute-force minimization of an empirical cost model ([`scalar_multiplication.cpp:254-273`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp#L254-L273)):
$$ c^* \;=\; \arg\min_{c \in [1, 20)} \;\bigg\lceil \frac{254}{c} \bigg\rceil \cdot \big(n + 2^c \cdot \alpha\big), \qquad \alpha = 5. $$
Doubling cost is dropped from the model (it's $O(c\,T)$, negligible against $Tn$ for large $n$). Empirically yields $c \approx 13\text{–}14$ at $n = 2^{20}$.

Number of rounds: $T = \lceil 254 / c \rceil$.

### 3.1.1 Per-thread Pippenger inner loop

What each thread runs on its work unit. MSB-first window ordering with Horner combination as the windows roll up:

```
   per-thread state:  bucket array B[0 .. 2^(c-1))  (all inactive)
                      result S_k = 0  (G_1, Jacobian)
                      schedule_buffer[work_unit.size]  (per-thread, reused)

   for window j = T-1 down to 0:           (MSB-first)
   ┌─────────────────────────────────────────────────────────┐
   │ 1. BUILD SCHEDULE                                       │
   │    for each input index i in work_unit:                 │
   │        k_signed = signed_slice_j(scalar_i)              │
   │        if k_signed == 0:  skip                          │
   │        bucket   = |k_signed|                            │
   │        sign     = sgn(k_signed)         // 0 or 1       │
   │        schedule[t++] = (i << 32) | bucket               │
   │        signs[t-1]    = sign                             │
   └────────────────────────────┬────────────────────────────┘
                                │ schedule length ≤ work_unit.size
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 2. MSD RADIX SORT  (in place)                           │
   │    by bucket field (low bits of entry)                  │
   │    8-bit radix, recursion-depth cap = 4                 │
   │    side effect: count of zero-bucket entries skipped    │
   └────────────────────────────┬────────────────────────────┘
                                │ schedule grouped by bucket
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 3. BATCH-AFFINE ACCUMULATE INTO B[]                     │
   │    (the hot loop — Diagram in §3.3)                     │
   │                                                         │
   │    Walks pairs of schedule entries, classifies each     │
   │    into one of 4 cases, queues independent affine adds, │
   │    runs them in batches of ~1024 sharing one Fr         │
   │    inversion, recirculates outputs.                     │
   │                                                         │
   │    Output: B[k] populated for each bucket with at       │
   │    least one contribution this window.                  │
   └────────────────────────────┬────────────────────────────┘
                                │ bucket array populated
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 4. SUFFIX-SUM REDUCE BUCKETS → W_j                      │
   │                                                         │
   │    m ← B[2^(c-1) - 1] + G_off    // offset trick        │
   │    g ← m                                                │
   │    for k = 2^(c-1) - 2 down to 1:                       │
   │        m ← m + B[k]                                     │
   │        g ← g + m                                        │
   │    g ← g − G_off · α      // α = pre-baked compensation │
   │    W_j ← g                                              │
   │                                                         │
   │    Cost per window: ~2·2^(c-1) G_1 adds (Jacobian)      │
   │                                                         │
   │    G_off (generator offset) sidesteps P+O edge cases in │
   │    Jacobian additions; safety = dlog hardness, not      │
   │    mathematical (see README, scalar_multiplication.hpp) │
   └────────────────────────────┬────────────────────────────┘
                                │ one G_1 point per window
                                ▼
   ┌─────────────────────────────────────────────────────────┐
   │ 5. HORNER COMBINE                                       │
   │    S_k ← S_k · 2^c_j + W_j                              │
   │      where c_j = c for j > 0, or (λ mod c) for j = 0    │
   │    (c · (T-1) doublings + (T-1) adds total over loop)   │
   └────────────────────────────┬────────────────────────────┘
                                ▼
                          reset bucket array B[] for next window
                          (cheap via bitvector clear, not 64 B × 2^(c-1))

   end for
                                ▼
                        return S_k
```

**Per-window cost summary:**

| Phase | Cost |
|---|---|
| Build schedule | $O(\text{work\_unit size})$, one signed-digit extract per index |
| MSD radix sort | $O(\text{work\_unit size})$, cache-friendly |
| Batch-affine accumulate | $\approx \text{work\_unit size} \cdot (3 \mathbb{F}_q\text{-mul} + |I|/m)$ |
| Suffix-sum reduce | $\approx 2 \cdot 2^{c-1}$ Jacobian adds |
| Horner | $c$ doublings + 1 add (G$_1$ Jacobian) |

The bucket-reset trick is worth a callout: after window $j$, the bucket array must be zeroed for window $j-1$. Naively this is $2^{c-1} \cdot 64$ bytes ($\sim 1$ MB at $c=15$). With the bitvector ([`bitvector.hpp`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/bitvector.hpp)), only the *bitmap* is cleared ($2^{c-1} / 64$ words = $\sim 16$ KB at $c=15$); buckets are read lazily and trusted only when the corresponding bit is set.

### 3.2 The affine trick + batched inversion

For $n \geq 128$ (`AFFINE_TRICK_THRESHOLD`), bucket accumulation uses **affine** addition with Montgomery's batch-inversion trick.

A single affine add $(x_1, y_1) + (x_2, y_2) = (x_3, y_3)$ on a short-Weierstrass curve with $a=0$ costs:
$$ \begin{aligned} \mu &= (y_2 - y_1) / (x_2 - x_1), \\ x_3 &= \mu^2 - x_1 - x_2, \\ y_3 &= \mu(x_1 - x_3) - y_1. \end{aligned} $$
The inversion in $\mu$ costs $|I| \approx 332|M|$. *Naively* this dominates the $\sim 5|M|$ field work per add.

Montgomery's trick: given $m$ independent denominators $d_1, \ldots, d_m$, compute all $m$ inverses with a single $|I|$ plus $\sim 3m|M|$:
$$ \pi_k = d_1 d_2 \cdots d_k, \qquad \pi_m^{-1} = d_1^{-1} \cdots d_m^{-1}, \qquad d_k^{-1} = \pi_{k-1} \pi_m^{-1} \prod_{j > k} d_j. $$
Per-add cost amortizes to:
$$ \text{cost}_{\text{add}} \;\approx\; 3|M| + |I|/m. $$
With $m \approx 1024$ pairs per batch (Barretenberg) or per round (WebGPU), the $|I|/m$ term is sub-multiplication; affine adds become **cheaper than Jacobian**.

### 3.2.1 Diagram — the recirculation + batched affine-add loop

This is the inner-most kernel (Phase 3 in §3.1.1). Both the *radix-sorted schedule* and the *recirculation queue* feed the same classifier; the classifier emits queued add pairs into a scratch buffer; once the buffer is full, all queued pairs run a single Montgomery batch-inversion and emerge as outputs that are then recirculated.

```
   ┌──────────────────────────────────────────────────────────────┐
   │ radix-sorted schedule (grouped by bucket)                    │
   │  ┌──────┬──────┬──────┬──────┬──────┬──────┬──────┐          │
   │  │ b=1  │ b=1  │ b=1  │ b=2  │ b=2  │ b=5  │ b=5  │  ...     │
   │  │ P_05 │ P_42 │ P_77 │ P_03 │ P_99 │ P_11 │ P_88 │          │
   │  └──────┴──────┴──────┴──────┴──────┴──────┴──────┘          │
   └─────────────────┬────────────────────────────────────────────┘
                     │ pairs of consecutive entries
                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ 4-CASE BRANCHLESS CLASSIFIER  (process_bucket_pair)          │
   │                                                              │
   │  Inputs:                                                     │
   │    lhs = (point_lhs, bucket_lhs)                             │
   │    rhs = (point_rhs, bucket_rhs)                             │
   │    acc[]    = per-bucket cached point                        │
   │    active[] = per-bucket "has accumulator" bitmap            │
   │                                                              │
   │  Booleans:                                                   │
   │    same    = (bucket_lhs == bucket_rhs)                      │
   │    has_acc = active[bucket_lhs]                              │
   │                                                              │
   │  ┌─────────┬─────────┬─────────────────────────────────────┐ │
   │  │ same?   │ has_acc?│ effect                              │ │
   │  ├─────────┼─────────┼─────────────────────────────────────┤ │
   │  │   T     │   T     │ queue (acc[b], rhs)                 │ │
   │  │         │         │ acc[b] stays (will be combined      │ │
   │  │         │         │  again via recirculation)           │ │
   │  ├─────────┼─────────┼─────────────────────────────────────┤ │
   │  │   T     │   F     │ queue (lhs, rhs)                    │ │
   │  │         │         │ no acc set                          │ │
   │  ├─────────┼─────────┼─────────────────────────────────────┤ │
   │  │   F     │   T     │ queue (acc[b], lhs)                 │ │
   │  │         │         │ acc[b] now empty (active[b] = 0)    │ │
   │  ├─────────┼─────────┼─────────────────────────────────────┤ │
   │  │   F     │   F     │ cache: acc[b] ← lhs;                │ │
   │  │         │         │        active[b] ← 1                │ │
   │  │         │         │ no pair queued                      │ │
   │  └─────────┴─────────┴─────────────────────────────────────┘ │
   │                                                              │
   │  Implementation: NO branches. Boolean × pointer selection    │
   │  and a sentinel `null_location` so the unconditional store   │
   │  in case (F, F) has a safe landing zone in the other cases.  │
   └─────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ SCRATCH BUFFER (2050 AffineElement slots; ~192 KB)           │
   │                                                              │
   │   Lower half = input pairs:                                  │
   │  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐           │
   │  │ P_0 │ Q_0 │ P_1 │ Q_1 │ P_2 │ Q_2 │ ... │ ... │           │
   │  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘           │
   │   plus destination[m] = target bucket for output k           │
   │                                                              │
   │   Upper half (filled after batch-add) = output sums          │
   └─────────────────┬────────────────────────────────────────────┘
                     │ scratch full (m ≈ 1024 pairs)?
                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ BATCH AFFINE ADD INTERLEAVED                                 │
   │                                                              │
   │ Step 1 — compute deltas in place:                            │
   │   for k in [0, m):                                           │
   │     δ_k = Q_k.x − P_k.x                                      │
   │     Q_k.x ← δ_k                  // overwrite, save a buffer │
   │                                                              │
   │ Step 2 — Montgomery prefix products:                         │
   │   π_0 ← δ_0;   π_k ← π_{k-1} · δ_k                           │
   │                                                              │
   │ Step 3 — ONE inversion:                                      │
   │   ρ_m ← π_{m-1}^{-1}                       ← 1 × |I| total   │
   │                                                              │
   │ Step 4 — back-substitute, write outputs into upper half:     │
   │   for k = m-1 down to 0:                                     │
   │     δ_k^{-1} = ρ_{k+1} · π_{k-1}                             │
   │     ρ_k       = ρ_{k+1} · δ_k                                │
   │     μ_k       = (Q_k.y − P_k.y) · δ_k^{-1}                   │
   │     R_k.x     = μ_k² − P_k.x − Q_k.x                         │
   │     R_k.y     = μ_k · (P_k.x − R_k.x) − P_k.y                │
   │     scratch[m + k] = R_k                                     │
   │                                                              │
   │ Total cost (per pair):  3 |M| + |I|/m                        │
   │   With m = 1024 and |I| ≈ 332|M|:  per-add ≈ 3.3 |M|         │
   │   (Jacobian mixed-add for comparison: ~11 |M|)               │
   │                                                              │
   │ Why "interleaved": lhs_base ≡ rhs_base (same buffer).        │
   │ The compiler can't prove writes don't alias reads in a       │
   │ 2-array variant, so it reloads. Interleaved layout + writes  │
   │ to the disjoint upper half resolves the aliasing.            │
   │ See element_impl.hpp:684-725.                                │
   └─────────────────┬────────────────────────────────────────────┘
                     │ m output points + their target buckets
                     ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ RECIRCULATE outputs through the SAME classifier              │
   │                                                              │
   │ Why: outputs heading to the same bucket meet in the          │
   │ classifier's "same bucket" branch and get queued for the     │
   │ NEXT batch inversion — instead of a random-access write into │
   │ bucket storage (which is 2^(c-1) entries = guaranteed cache  │
   │ miss).                                                       │
   │                                                              │
   │ Effect: the bucket array sees minimal direct writes; most    │
   │ adds happen through the scratch buffer chain.                │
   └─────────────────┬────────────────────────────────────────────┘
                     │
            ┌────────┴────────┐
            │ outer loop:     │
            │ more schedule   │
            │ entries left?   │
            │ recirc queue    │
            │ non-empty?      │
            └─┬───────────────┘
              │ yes        │ no
              │            │
              ▼            ▼
        back to top      DONE — bucket array fully populated
```

**Why this is the load-bearing trick.** The Pippenger inner loop does $\sim n$ adds per window. With naive Jacobian mixed-add (\~11 $|M|$ each) the cost is $11nT|M|$. With the batched affine trick (\~3.3 $|M|$ each) the cost drops to $3.3nT|M|$ — *a factor of \~3.3$\times$ on the hottest path*. This is the single biggest reason Barretenberg's MSM is competitive.

### 3.3 Point scheduling and MSD radix sort

Scheduled adds are tagged with their target bucket. The scheduler builds a list of pairs $(P_i, k_i)$ where $k_i = s_{i, j}$ for the current window. To turn the random-access into sequential, the list is **MSD radix-sorted** by bucket index ([`process_buckets.cpp`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/process_buckets.cpp), `RADIX_BITS = 8`).

The schedule entry layout (`scalar_multiplication.hpp:191-200`):
```
entry = (point_index << 32) | bucket_index
```
Fits in `uint64_t`. The 32-bit `point_index` field caps MSM at $2^{32}$ points.

Post-sort, the **"recirculation" loop** ([`scalar_multiplication.cpp:408-495`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp#L408-L495)) walks consecutive pairs, classifies each into one of four branchless cases (same bucket × bucket already has accumulator), batches up to $\sim 1024$ independent affine pairs into the scratch buffer, runs one batched inversion, and re-feeds the outputs through the same classifier — outputs going to the same bucket are queued for the next batch rather than written to bucket storage. Bucket storage is $2^c$ random-access; every direct write is a cache miss. Recirculation suppresses those.

The branchless classifier is real: there are no `if`s in `process_bucket_pair` ([`scalar_multiplication.hpp:363-392`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp#L363-L392)); a sentinel `null_location` gives unconditional stores a safe landing zone.

### 3.4 WASM-specific: the 9 × 29 field representation

Native x86_64 BN254 uses **4 × 64-bit** limbs with `__int128` for the inner $64\times 64 \to 128$ multiply (hand-written x86 asm in `field_impl_x64.hpp`).

WASM has neither `__int128` nor an efficient 128-bit mul. The chosen representation ([`field_declarations.hpp:73-76`](../../../cpp/src/barretenberg/ecc/fields/field_declarations.hpp#L73-L76)):
$$ a \;=\; \sum_{i=0}^{8} a_i\, 2^{29 i}, \qquad a_i \in [0, 2^{29}). $$

#### Limb-layout comparison across our three targets

```
   Native x86_64        WASM (wasm-threads)        WebGPU (WGSL)
   4 × 64-bit limbs     9 × 29-bit limbs           20 × 13-bit limbs
   ────────────────     ─────────────────          ────────────────────
   ┌──────────────┐     ┌──────────────┐           ┌─────────────────┐
   │  a_0  [64]   │     │ a_0  [29]    │           │ a_0  [13]       │
   ├──────────────┤     ├──────────────┤           │ a_1  [13]       │
   │  a_1  [64]   │     │ a_1  [29]    │           │ a_2  [13]       │
   ├──────────────┤     ├──────────────┤           │  ⋮              │
   │  a_2  [64]   │     │ a_2  [29]    │           │ a_19 [13]       │
   ├──────────────┤     ├──────────────┤           └─────────────────┘
   │  a_3  [64]   │     │ a_3  [29]    │           Packed in u32 limbs,
   └──────────────┘     ├──────────────┤           one limb per u32
                        │ a_4  [29]    │           (3 wasted bits each).
   16 lower mults       ├──────────────┤
   per outer mul.       │ a_5  [29]    │           Per-mul work ~ L²:
                        ├──────────────┤             20² = 400 partial
                        │ a_6  [29]    │             u32 mul_lo/mul_hi
                        ├──────────────┤
                        │ a_7  [29]    │           (the SMVP/BPR/Horner
                        ├──────────────┤            cost on GPU is
                        │ a_8  [29]    │            dominated by these
                        └──────────────┘            inner mul_lo/mul_hi
                                                    pairs)
                        81 lower mults
                        per outer mul.
                        Plus 9 reduces
                        (Montgomery REDC).
```

| Property | Native | WASM | WebGPU |
|---|---|---|---|
| Limb width $w$ | 64 | 29 | 13 |
| Limb count $L$ | 4 | 9 | 20 |
| Inner mults / outer mul ($L^2$) | 16 | **81** | **400** |
| Stored bytes per element | 32 | 36 (packed) / 72 (u64 lanes) | 80 (one u32 per limb) |
| Native carry primitive | `adc`/`sbb` | arith. right-shift trick | u32 add → carry-aware |
| Wide-mul primitive | `__int128` | `uint64_t` ($29 \times 29 < 2^{58}$) | u32 mul_lo + mul_hi |
| Overflow-safe? | uses `__int128` | $29+29+\log_2 L < 64$ ✓ | $13+13+\log_2 L < 32$ ✓ |
| Per-mul rel. cost vs native | 1× | $\sim 4\text{–}6\times$ | $\sim 25\times$ (estimate) |

The cross-target trend is clear: smaller limbs $\Rightarrow$ more inner multiplications $\Rightarrow$ higher per-mul cost. The GPU compensates with massive parallelism (every thread runs a field mul). The WASM lane has neither parallelism (one thread per pthread) nor native wide-multiply.

#### Why 29?

The non-overflow constraint pins $w$:
$$ \boxed{\ L \cdot 2w + \lceil \log_2 L \rceil \;\leq\; 64\ } \quad \text{for the partial-product accumulator.} $$
With $L \leq 9$: $\lceil \log_2 9 \rceil = 4$, so $2w \leq 60$, giving $w \leq 30$. And the lower bound from "must hold 254 bits": $L \cdot w \geq 254$, i.e. $w \geq 254/9 = 28.2$. The integer solution is $w \in \{29, 30\}$; 29 leaves slightly more headroom and was chosen.

| Width $w$ | Limbs $L$ | Inner mults $L^2$ | Overflow handler? |
|---|---|---|---|
| 24 | 11 | 121 | no |
| 29 | 9 | **81** | **no** ✓ |
| 32 | 8 | 64 | yes, per mul |
| 64 | 4 | 16 | yes, no native mul |

29 minimizes inner mults subject to the no-overflow constraint. The 32-bit choice saves 17 mults per outer mul but every one needs an overflow handler — net slower.

Per-multiply cost is empirically **4–6× native**, with `BBERG_PIPPENGER.md` citing the ratio as a load-bearing reason WASM MSM can't catch native MSM. Field multiplication is **interleaved madd/reduce** (one row of partial products + one reduction per iteration, 9 iterations total) so intermediates stay within 9 limbs rather than ballooning to 18. Constant-time conditional subtraction uses arithmetic-right-shift of the signed difference for borrow extraction since WASM lacks `adc`/`sbb`.

### 3.5 Threading model

The `wasm-threads` preset ([`CMakePresets.json:428-438`](../../../cpp/CMakePresets.json#L428-L438)) — which bb.js loads — uses **pthread-based** parallel-for via `parallel_for_mutex_pool` ([`thread.cpp:124`](../../../cpp/src/barretenberg/common/thread.cpp#L124)). Default pool size is `min(32, std::thread::hardware_concurrency())`.

Parallelism is across **input partitions**, not across windows ([`scalar_multiplication.cpp:524-568`](../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp#L524-L568)). Each `MSMWorkUnit` runs the full Pippenger algorithm — all rounds, all buckets — single-threaded on a contiguous slice of the schedule. Results are summed in $\mathbb{G}_1$ at the end. The reason for partitioning by points rather than by windows is to avoid atomic contention on the bucket array; partitioning by points gives each thread a private bucket array.

> **Important.** The non-threaded `wasm` preset (line 401-426) sets `MULTITHREADING: OFF` and defines `NO_MULTITHREADING`, which is what `BBERG_PIPPENGER.md` describes when it says "threading collapses to serial". The bb.js bench label "WASM MT" in the WebGPU dev page is talking about `wasm-threads`, not the non-threaded variant. The two are different builds.

### 3.6 What the Barretenberg Pippenger does NOT do

Verified by source inspection. Each of these is on the table for the WebGPU implementation to exploit:

| Feature | Status | Reference / file:line |
|---|---|---|
| GLV / endomorphism for MSM | ✗ Not used | `grep endomorphism scalar_multiplication.{cpp,hpp}` → 0 hits |
| WASM SIMD | ✗ Not used | `grep wasm_simd128\|__builtin_wasm` over `cpp/` → 0 hits |
| Signed-digit / NAF | ✗ Not used | `get_scalar_slice` returns `uint32_t`, no sign bit |
| Window tables | ✗ Not used | No precomputed $[k]P_i$ tables |
| Lagrange-basis SRS | ✗ Not used | SRS used as-is |

GLV in particular is a $2\times$ asymmetry. Endomorphism constants exist in the field code and `mul_with_endomorphism` is used for single-scalar mul ([`element_impl.hpp:565`](../../../cpp/src/barretenberg/ecc/groups/element_impl.hpp#L565)), but the MSM path goes through the textbook 254-bit scalar split. The WebGPU port inherited this and also doesn't use GLV.

### 3.6.1 Side-by-side: Barretenberg WASM vs. WebGPU pipeline

The two implementations execute the *same Pippenger structure* but slice the parallelism axis differently. Barretenberg parallelises over **input partitions** ($K$ pthreads, each doing the full algorithm sequentially over its slice). WebGPU parallelises over **work within each stage** ($\sim 10^4$ GPU threads working concurrently on the same logical step, $T$ subtasks running in parallel where possible).

```
                  BARRETENBERG WASM-MT                      WEBGPU
                  (K pthreads, partition-parallel)          (massively pass-parallel)
                  
   stage 0   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ partition_by_weight          │          │ (none; whole n processed     │
   pre-      │ K MSMWorkUnits               │          │  in every kernel)            │
   process   └──────────────────────────────┘          └──────────────────────────────┘
   
   stage 1   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ get_scalar_slice              │   ──→   │ decompose_scalars_only       │
   per-      │ (called inside per-window     │          │ (one pass; emits all T × n   │
   scalar    │  loop, on the fly)            │          │  signed-digit chunks)        │
   digits    └──────────────────────────────┘          └──────────────────────────────┘
   
   stage 2   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ MSD radix sort                │   ──→   │ transpose_count              │
   sort      │ (per work-unit, per window)   │          │ transpose_scan               │
   schedule  │ 8-bit, depth ≤ 4              │          │ transpose_scatter (CSR→CSC)  │
             └──────────────────────────────┘          └──────────────────────────────┘
   
   stage 3   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ batch_accumulate_points_into  │          │ ba_init                       │
   bucket    │   _buckets                   │           │ for r in MAX_ROUNDS:          │
   sums      │   • 4-case classifier         │   ──→    │   ba_schedule                 │
             │   • scratch buffer            │          │   ba_inverse (batch invert)   │
             │   • batch invert (≈ 1024     │           │   ba_apply                    │
             │     pairs / inversion)        │          │ ba_finalize_*                 │
             │   • recirculate outputs       │          │                               │
             │                              │           │ Same affine trick;            │
             │ Per-window, sequential on     │          │ parallelised across pairs.    │
             │ one thread                    │          │                              │
             └──────────────────────────────┘          └──────────────────────────────┘
   
   stage 4   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ suffix-sum reduce             │   ──→   │ bpr_1 (parallel W threads     │
   reduce    │ (one thread walks 2^(c-1)     │          │   per window)                 │
   buckets   │  buckets sequentially per     │          │ bpr_2 (combine W threads)     │
             │  window; uses G_offset trick) │          │                              │
             └──────────────────────────────┘          └──────────────────────────────┘
   
   stage 5   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ Horner across windows         │   ──→   │ subtask_reduce               │
   combine   │ (interleaved with stage 4,   │           │ (single workgroup, T threads,│
             │  inside per-window loop)      │          │  thread 0 walks Horner chain)│
             └──────────────────────────────┘          └──────────────────────────────┘
   
   stage 6   ┌──────────────────────────────┐          ┌──────────────────────────────┐
             │ G_1 sum of K partial points  │           │ (none; single point already) │
   reduce    │ S = Σ S_k                    │           │                              │
   threads   └──────────────────────────────┘          └──────────────────────────────┘
```

**Mapping table with the relative-cost stories.**

| Algorithm step | Barretenberg WASM | WebGPU | Comment |
|---|---|---|---|
| Per-scalar digit extraction | inline `get_scalar_slice` per window | one-shot `decompose_scalars_only` | WebGPU writes all $T \cdot n$ digits up-front; Bberg interleaves with the per-window loop |
| Schedule sort | MSD radix, 8-bit, depth ≤ 4, in-place | parallel CSR→CSC transpose | functionally identical (group by bucket); WebGPU pays an extra prefix-sum pass for parallelism |
| Bucket accumulate | recirculation + 4-case classify + batch invert | round-loop: `init → schedule → invert → apply → finalize` | **same affine trick**; WebGPU adds round-loop overhead (~32–192 rounds) for parallelism |
| Bucket reduce per window | single-threaded suffix sum + Horner inside loop | parallel `bpr_1` + `bpr_2` over $W$ threads | WebGPU pays $O(\log W)$ extra work for the combine but parallel; Bberg is $O(B)$ sequential |
| Window Horner | inside window loop | dedicated `subtask_reduce` kernel | identical math; one is interleaved, the other is a discrete kernel |
| Thread reduce | $K-1$ G$_1$ adds | none (single thread per stage) | Bberg's penalty for partition-parallelism |
| Field multiply (per scalar mul) | 81 inner mults (9 × 9) | 400 inner mults (20 × 20) | GPU compensates with parallel threads — see §3.4 |

**The takeaway.** Barretenberg pays single-thread cost everywhere but with very cheap field mul (9 × 29) and a tightly-engineered hot loop (branchless classifier, batched invert, recirculation). WebGPU pays high per-element field-mul cost (20 × 13) but runs $\sim 10^4$ elements concurrently — the GPU wins when there's enough $n$ to saturate execution units. The $n = 2^{16}$ "crossover" we observe in the bench data is exactly this: not enough work below this point to amortize the GPU's per-element disadvantage; enough above.

### 3.7 Key constants

| Constant | Value | Purpose |
|---|---|---|
| `BUCKET_ACCUMULATION_COST` | 5 | weight of $2^c$ in cost model |
| `AFFINE_TRICK_THRESHOLD` | 128 | min $n$ for affine path |
| `MAX_SLICE_BITS` | 20 | window-size search ceiling |
| `PREFETCH_LOOKAHEAD` / `INTERVAL` | 32 / 16 | software prefetch distance (native only) |
| `BATCH_SIZE` | 2048 (≈ 1024 pairs) | scratch slots for batched inversion |
| `RADIX_BITS` | 8 | MSD radix sort bucketing |
| `COST_OF_INVERSION` | 332 | mults equivalent for one $|I|$ |
| `PIPPENGER_THRESHOLD` | 16 | below this, naive `small_mul` |
| `FIXED_PER_SCALAR_WEIGHT` | 4 | partitioning overhead per scalar |

---

## 4. The WebGPU MSM Pipeline

Located in [`barretenberg/ts/src/msm_webgpu/`](.). Ported from the original tal-webgpu cuZK-derived implementation; same algorithmic skeleton, with several BN254-only specializations and a persistent-context architecture for SRS reuse.

### 4.1 Top-level pipeline

The full call sequence (per MSM dispatch, after one-time SRS precomputation):

```
                            n scalars (32 LE bytes each)
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │ Stage 1: decompose_scalars_only                          │
        │   one shader pass; writes scalar_chunks_sb               │
        │   layout: T × n u32 signed-digit chunks                  │
        │   (fused with transpose_count atomicAdds on warm path)   │
        └────────────────────────┬─────────────────────────────────┘
                                 │   T · n × u32
                                 ▼
        ┌──────────────────────────────────────────────────────────┐
        │ Stage 2: parallel transpose (CSR → CSC)                  │
        │   pass A: transpose_count    (count per column)          │
        │   pass B: transpose_scan     (prefix sum across columns) │
        │   pass C: transpose_scatter  (write to CSC order)        │
        └────────────────────────┬─────────────────────────────────┘
                                 │   sorted point indices, per window
                                 ▼
        ┌──────────────────────────────────────────────────────────┐
        │ Stage 3: batch-affine SMVP                               │
        │   ba_init   ─→  for round in [0, MAX_ROUNDS):            │
        │                  ├─ ba_schedule         (queue pairs)    │
        │                  ├─ ba_inverse          (batch inverse)  │
        │                  └─ ba_apply            (affine adds)    │
        │                ba_finalize_collect / inverse / apply     │
        │   output: 2^c-1 bucket sums in Jacobian coordinates      │
        └────────────────────────┬─────────────────────────────────┘
                                 │   T × B Jacobian buckets
                                 ▼
        ┌──────────────────────────────────────────────────────────┐
        │ Stage 4: Bucket Points Reduction (BPR)                   │
        │   bpr_1[subtask=*]  (per-window suffix sum, parallel)    │
        │   bpr_2[subtask=*]  (combine the W threads of bpr_1)     │
        │   output: T partial MSM points (one per window)          │
        └────────────────────────┬─────────────────────────────────┘
                                 │   T × G1 partial sums
                                 ▼
        ┌──────────────────────────────────────────────────────────┐
        │ Stage 5: subtask_reduce (GPU Horner combination)         │
        │   single-workgroup kernel; T threads in stage_1, then    │
        │   thread 0 walks the Horner chain c × T-1 doublings      │
        │   + (T-1) adds; final point in result_x/y/z[0]           │
        └────────────────────────┬─────────────────────────────────┘
                                 │
                                 ▼   one (X,Y,Z) Jacobian point
                          readback to CPU, normalize, return
```

### 4.2 Stage 1: scalar decomposition

[`shader_manager.ts gen_decompose_scalars_only_shader`](cuzk/shader_manager.ts) + [`wgsl/cuzk/decompose_scalars_signed_only.template.wgsl`](wgsl/cuzk/decompose_scalars_signed_only.template.wgsl).

Reads $n$ raw 32-byte LE scalars and emits a $T \times n$ array of **signed** digit chunks in $[-2^{c-1}, 2^{c-1})$ encoded as `u32` with a bias. Top-chunk uses an override when $\lambda \bmod c \neq 0$.

The warm-path variant additionally atomicAdds into `col_ptr_sb`, fusing the transpose's count phase into this pass. Saves $\sim 3$ ms at $n = 2^{16}$ vs. running a standalone transpose-count kernel ([`shader_manager.ts:257-261`](cuzk/shader_manager.ts#L257-L261) commentary).

### 4.3 Stage 2: parallel transpose (CSR → CSC)

[`msm.ts transpose_gpu_parallel`](msm.ts).

The decomposed chunks form a $T \times n$ CSR-style matrix (row $j$ is "all $n$ digits in window $j$"). The bucket accumulation in stage 3 wants this transposed to CSC (row $k$ is "all input indices with digit $k$ in some window"). Three-phase parallel transpose:

* **count** — count entries per column ($O(Tn)$ atomic adds; subsumed into decompose when warm).
* **scan** — exclusive prefix sum per row across columns ($O(T \cdot 2^c)$).
* **scatter** — write `val_idx[]` to the right place using a per-column cursor ($O(Tn)$).

The earlier *serial* transpose was measured at $\sim 65$ ms at $n = 2^{16}$ — a quarter of GPU time on the legacy path. The parallel version brings it under 2 ms total.

### 4.4 Stage 3: batch-affine SMVP

[`cuzk/batch_affine.ts`](cuzk/batch_affine.ts) + the `batch_affine_*` WGSL templates.

For each subtask $j \in [0, T)$ and bucket $k \in [1, B)$, the bucket sum is:
$$ B_{j,k} \;=\; \sum_{\substack{i \,:\, s_{i,j} = k \\ \text{or } s_{i,j} = -k \;(\text{negate})}} \pm P_i. $$

The pipeline maintains a **running affine sum** per bucket and processes pairs of (current running sum, next point to add). On each round:

1. **ba_schedule** — one thread per bucket. Reads the next point pointer; if the bucket has unprocessed points, atomically appends a pair $(P=\text{running}, Q=\text{next}, \delta = Q_x - P_x, \text{target}=k)$ to the global pair pool. Collisions ($\delta = 0$) are skipped silently — fine for SRS-backed bases (collisions are unreachable absent dlog break).
2. **ba_inverse** — batch-invert all $m$ pair deltas using Montgomery's trick. Output: $\delta_i^{-1}$ for each queued pair.
3. **ba_apply** — one thread per pair. Reads $(P, Q, \delta^{-1})$, computes the affine sum $P + Q$, writes back to `running_x/y[\text{target}]`.

Continues for `MAX_ROUNDS` rounds, sized to amortize over the expected number of buckets:
```
MAX_ROUNDS = { 32 at n=2^16, 48 at n=2^17, 64 at n=2^18,
               128 at n=2^19, 192 at n=2^20 }
```
([`batch_affine.ts:736-744`](cuzk/batch_affine.ts#L736-L744)). After `MAX_ROUNDS`, **finalize** packages remaining unprocessed pairs in a single batch.

Per-pair cost is $\sim 3|M| + |I| / m$ (the affine trick on GPU). The Jacobian SMVP path it replaced averaged $\sim 11|M|$ per add (mixed-add Jacobian); the batch-affine version is empirically $\sim 1.8\times$ faster on the inner loop.

### 4.5 Stage 4: Bucket Points Reduction (BPR)

[`msm.ts`](msm.ts) lines $\sim 1041\text{-}1176$, plus [`wgsl/cuzk/bpr_bn254.template.wgsl`](wgsl/cuzk/bpr_bn254.template.wgsl).

For each window $j$, given buckets $\{B_{j,k}\}$, compute
$$ W_j \;=\; \sum_{k=1}^{B-1} k \cdot B_{j,k}. $$
Using the running-sum identity, this is done as follows. Let $W = b\text{\_workgroup\_size}$ be the number of GPU threads working on window $j$, splitting the $B$ buckets into $W$ contiguous slices. Each thread $t \in [0, W)$ walks its slice from high to low computing:
$$ m_t = \sum_{k \in S_t} B_{j,k}, \qquad g_t = \sum_{k \in S_t} (\#\text{adds remaining}) \cdot B_{j,k}, $$
i.e., a local "running pair" $(m, g)$ that's a thread-local version of the textbook running sum + accumulator. **BPR-1** computes the $(m_t, g_t)$ pairs in parallel; **BPR-2** combines them into the per-window total $W_j$ via a final pass.

Cost: $\sim 2B$ additions per window. With $B = 2^{14}$ (signed $c=15$): $\sim 32{,}768$ adds per window.

This is the stage whose cost is **independent of $n$**.

### 4.6 Stage 5: GPU Horner reduction

[`subtask_reduce` shader](wgsl/cuzk/horner_reduce_bn254.template.wgsl).

Combines $T$ window points into the final $S$:
$$ S \;=\; W_0 + 2^c W_1 + 2^{2c} W_2 + \cdots + 2^{(T-1)c} W_{T-1}. $$
Single workgroup, $T$ threads. Thread 0 walks the Horner chain: $c$ doublings + 1 add per step, $T - 1$ steps. With $c = 15$, $T = 17$: $240$ doublings + $16$ adds. Stays on-GPU; CPU reads back $\sim 240$ bytes (single Jacobian point) and normalizes.

### 4.7 Persistent context (`GpuContext`)

[`cuzk/gpu_context.ts`](cuzk/gpu_context.ts).

The Honk / chonk prover issues 20–50 MSMs per proof against the same SRS. The cold path (`compute_bn254_msm`) acquires a `GPUDevice`, compiles every pipeline, uploads the SRS, runs Stage 1, and destroys the device — per MSM. On Dawn/Tint, **shader JIT alone is > 100 ms on first dispatch** of each pass.

`GpuContext` caches across calls:

* one `GPUDevice` for the page lifetime,
* compiled `GPUComputePipeline` objects, keyed by `(shaderCode, entryPoint, layout)`,
* persistent `GPUBuffer`s for all per-call workspace (`bucket_sum_*`, `g_points_*`, etc.) — keyed by `(curve, num_subtasks, num_columns, num_words, input_size)`,
* persistent `GPUBindGroup`s — re-using the cached `GPUBuffer` objects so the bind group itself can be cached.

Per-MSM scalars are uploaded into a cached `scalars_sb` (size-stable for same $n$) via `device.queue.writeBuffer`. Cached bases live in a separate `CachedBases` object created once via `precompute_bn254_bases` and reused across calls.

This is what unlocks the 75 ms / 2$^{16}$ number. Without the persistent context, every MSM eats $\sim 200$ ms of setup.

### 4.8 Constants

| Constant | Value | Where |
|---|---|---|
| `WORD_SIZE` ($w$) | 13 bits | [`cuzk/curve_config.ts`](cuzk/curve_config.ts) |
| `NUM_WORDS` ($L$) | 20 | derived |
| `chunk_size` ($c$) | 15 for $n \geq 2^{16}$, else 4 | [`msm.ts:589`](msm.ts#L589) |
| `num_subtasks` ($T$) | $\lceil 254 / c \rceil = 17$ | [`msm.ts:610`](msm.ts#L610) |
| `num_columns` ($2 B$) | $2^c = 32{,}768$ | [`msm.ts:600`](msm.ts#L600) |
| `MAX_ROUNDS` | 32 → 192 over $n = 2^{16}\ldots 2^{20}$ | [`batch_affine.ts:736`](cuzk/batch_affine.ts#L736) |
| `b_workgroup_size` (W in §4.5) | 256 | [`msm.ts`](msm.ts) |

The choice $c = 15$ (vs. the textbook optimum $c = 13\text{–}14$ at $n = 2^{20}$) is a deliberate trade-off. With $c = 15$:
$$ T = \lceil 254/15 \rceil = 17 \quad\text{vs.}\quad T = \lceil 254/16 \rceil = 16. $$
But $T \cdot B = 17 \cdot 2^{14}$ vs $16 \cdot 2^{15}$, i.e. $278{,}528$ vs $524{,}288$ — **$c = 15$ cuts BPR-1 cost by 1.88$\times$** for nearly-equal SMVP work. The comment at [`msm.ts:574-580`](msm.ts#L574-L580) walks through the calculus.

---

## 5. Profile Analysis

### 5.1 Measured sweep

Hardware: hardwareConcurrency = 14. Median over 5 reps after one warm-up dispatch.

| $\log_2 n$ | $n$ | WebGPU (ms) | WASM-MT (ms, 14t) | Speedup |
|---|---|---|---|---|
| 16 | 65,536 | 75.3 | 77.7 | 1.03× |
| 17 | 131,072 | 91.9 | 127.4 | 1.39× |
| 18 | 262,144 | 139.6 | 226.0 | 1.62× |
| 19 | 524,288 | 222.7 | 422.4 | 1.90× |
| 20 | 1,048,576 | 396.9 | 816.2 | 2.06× |

### 5.2 Per-stage GPU breakdown (median ms, subtasks/rounds summed within rep)

| Stage | $n = 2^{16}$ | $n = 2^{17}$ | $n = 2^{18}$ | $n = 2^{19}$ | $n = 2^{20}$ | Scaling |
|---|---|---|---|---|---|---|
| `decompose_scalars_only` | 0.8 (1%) | 1.4 (1%) | 2.8 (2%) | 5.9 (3%) | 10.6 (3%) | $\sim n$ |
| `transpose_scan` | 0.4 | 0.5 | 0.5 | 0.5 | 0.4 | constant |
| `transpose_scatter` | 0.8 | 1.8 | 4.6 | 9.7 | 11.0 | $\sim n$ |
| `ba_init` | 0.6 | 0.7 | 1.3 | 1.2 | 1.0 | constant |
| `ba_schedule` | 2.0 (3%) | 3.9 (4%) | 8.1 (6%) | 16.8 (8%) | 32.2 (9%) | $\sim n$ |
| **`ba_inverse`** | **24.6 (31%)** | **31.3 (32%)** | **50.2 (36%)** | **88.1 (40%)** | **175.2 (47%)** | $\sim n$ |
| **`ba_apply`** | **7.3 (9%)** | **11.2 (11%)** | **22.2 (16%)** | **42.7 (20%)** | **76.7 (21%)** | $\sim n$ |
| `ba_finalize_*` | 5.3 | 6.4 | 5.3 | 5.7 | 6.1 | constant |
| **`bpr_1`** | **29.2 (37%)** | **26.6 (27%)** | **26.5 (19%)** | **27.2 (12%)** | **31.6 (8%)** | **constant** |
| `bpr_2` | 3.2 | 3.3 | 3.1 | 3.0 | 4.0 | constant |
| `subtask_reduce` | 2.2 | 1.7 | 2.2 | 2.2 | 2.1 | constant |
| **profiled passes** $\Sigma$ | 76.3 (96%) | 92.6 (95%) | 124.0 (88%) | 202.5 (93%) | 350.0 (94%) | |
| **untimestamped** | 3.5 | 4.4 | 16.5 | 15.9 | 22.2 | $\nearrow$ in steps |
| **GPU compute wall** | 79.7 | 97.5 | 140.4 | 218.4 | 374.0 | |
| `readback_total` | 80.0 | 97.6 | 140.7 | 218.5 | 375.0 | (≈ GPU wall) |
| `mapasync_overhead` | 0.2 | 0.1 | 0.1 | 0.1 | 0.2 | negligible |
| `upload_scalars` (CPU) | 0.1 | 1.6 | 3.2 | 6.2 | 15.2 | $\sim n$ |

### 5.3 Visualization

GPU wall composition, normalized to %. Top: $n = 2^{16}$ (BPR-dominated, fixed costs visible). Bottom: $n = 2^{20}$ (inverse-dominated, scaling costs visible).

```
n = 2^16  (75 ms wall)
[ba_inverse 31%][bpr_1 37%   ][ba_apply 9%][others 19%][untim 4%]

n = 2^20  (374 ms wall)
[ba_inverse 47%               ][ba_apply 21%   ][ba_schedule 9%][bpr_1 8%][others 9%][untim 6%]
```

### 5.4 Scaling behavior

```
ms                                                ba_inverse ●
175 ┤                                                       ╱
    │                                                     ╱
150 ┤                                                   ╱
    │                                                 ╱
125 ┤                                               ╱
    │                                             ╱
100 ┤                                           ╱             ba_apply ▲
    │                                         ╱             ╱
 75 ┤                                       ╱             ╱
    │                                     ╱             ╱
 50 ┤                              ●     ╱             ╱
    │                            ╱     ╱             ╱
 25 ┤                  ●       ╱     ╱             ╱       ba_schedule ◆ bpr_1 ▼
    │   ●        ╱           ╱     ╱             ╱            ◆     ◆
    │    ●─────────●─────────●─────●─────────────────────────────────────▼─▼─▼─▼
  0 └────┴─────────┴─────────┴─────┴─────────────────────────
       2^16     2^17     2^18    2^19              2^20
```

`ba_inverse` (●) and `ba_apply` (▲) are *linear* in $n$. `bpr_1` (▼) is essentially **flat** — it scales with $B = 2^{14}$, not with $n$. `ba_schedule` (◆) is linear but with a small slope.

### 5.5 What the WebGPU pipeline does well

* **Stage-by-stage parallelism.** Every stage is parallel except `subtask_reduce` (which only needs to do $\sim 250$ ops total, so single-workgroup is fine).
* **Persistent SRS.** Bases live on the GPU in Montgomery form; `writeBuffer` per call only uploads scalars ($n \times 32$ B), not bases ($n \times 64$ B raw + Stage-1 convert).
* **Fused decompose + transpose-count.** Saves $\sim 3$ ms at $n = 2^{16}$.
* **Parallel transpose.** $\sim 1.5$ % of wall, down from $\sim 25$ % on the serial version.
* **Choice of $c = 15$.** Cuts BPR-1 cost by $\sim 2\times$ vs. $c = 16$.
* **Batch-affine SMVP.** $\sim 1.8\times$ faster inner loop than Jacobian mixed-add.

### 5.6 What the WebGPU pipeline does poorly

| Stage | $n=2^{20}$ share | Problem | Action |
|---|---|---|---|
| `ba_inverse` | 47% | Per-round single-threaded Fermat, $T$ separate inversions | Tune `NUM_SUB_WGS` of the parallel kernel ([§6.2](#6-optimization-roadmap)) |
| `ba_apply` | 21% | Likely BW-bound on BigInt reads | Roofline + SoA / limb-width ([§6.3](#6-optimization-roadmap)) |
| `bpr_1` | 8% (37% at $n=2^{16}$) | Default `legacy` inner loop with collision checks | Flip to `mixed_safe` or `assume_affine` ([§6.1](#6-optimization-roadmap)) |
| untimestamped | 4-12% | Hidden pass overhead, possibly from gated `sample_*` rounds | Diagnose (force-sample all rounds) |
| `upload_scalars` | (CPU; $\sim 15$ ms at $n=2^{20}$) | Serial gap, CPU idle during GPU work | Pipeline writeBuffer with next dispatch |

---

## 6. Optimization Roadmap

Ordered by expected leverage, with predicted wins anchored to the measured profile.

### 6.1 Tier 1 — Flip `bpr_inner_loop` to a faster variant

**Status.** Already in the library, behind a `bpr_inner_loop: "legacy" | "mixed_safe" | "assume_affine"` parameter ([`msm.ts:269-274`](msm.ts#L269-L274)). Dev page currently defaults to `"legacy"`.

* `"mixed_safe"`: mixed-add for the running $m$, full safe add for the accumulator $g$. Documented $\sim 8$ ms savings on BPR-1 at $n = 2^{16}$. No algorithmic risk.
* `"assume_affine"`: mixed-add + no-collision Jacobian everywhere. Documented $\sim 13\text{-}25$ ms savings. The comment flags Tint/Metal codegen sensitivity from a past Dawn crash, but the algorithm is CPU-validated.

**Predicted wall after flip.**

| Variant | $n = 2^{16}$ | $n = 2^{20}$ |
|---|---|---|
| `legacy` (current) | 75 ms | 397 ms |
| `mixed_safe` | $\sim 67$ ms (−10%) | $\sim 389$ ms (−2%) |
| `assume_affine` | $\sim 55$ ms (−27%) | $\sim 380$ ms (−4%) |

This is **free at small $n$** and trivial to A/B in the dev page.

### 6.2 Tier 2 — `ba_inverse` parallelism

**The fish.** At $n = 2^{20}$, `ba_inverse` is $175.2$ ms / $374$ ms = **47% of the wall**. Linear in $n$.

The shader manager already builds a *parallel* batch-inverse kernel: `gen_batch_inverse_parallel_shader` ([`shader_manager.ts`](cuzk/shader_manager.ts) — search for `batch_inverse_parallel`). The kernel runs $\text{NUM\_SUB\_WGS}$ workgroups per subtask, each independently batch-inverting a slice of the per-round pair pool.

```
Round r, subtask j:
   pair pool of size m_j ────────────────────────┐
                          ┌─────────────────────────┐
                          ▼      ▼      ▼      ▼   (NUM_SUB_WGS workgroups)
                       ┌────┐┌────┐┌────┐┌────┐
                       │ WG ││ WG ││ WG ││ WG │
                       │ T= ││ T= ││ T= ││ T= │   each WG runs one fr_inv
                       │ 64 ││ 64 ││ 64 ││ 64 │   independently on its slice
                       └────┘└────┘└────┘└────┘
```

Per-thread sequential serialisation drops by $\text{NUM\_SUB\_WGS}\times$ for Phase A (prefix-products) and Phase D (back-substitution).

**Open questions to investigate:**

1. Is the kernel actually wired in for `ba_inverse[r=*]` on the current path? The label exists, but the choice of which kernel it calls may not have been tuned for our $n$ range.
2. Can `NUM_SUB_WGS` rise with $n$? At $n = 2^{20}$ there are roughly $n / B = 32$ pairs per bucket; ample per-subtask pool to slice.
3. Could `MAX_ROUNDS` *decrease* with bigger pools per round? Fewer rounds × bigger inversions $=$ less per-round command-buffer overhead. (Trades against tail rounds with few survivors.)

**Predicted ceiling:** if `ba_inverse` halves at $n = 2^{20}$, wall drops to $\sim 285$ ms (−28 %). 2$\times$ here would put WebGPU at $\sim 2.9\times$ over WASM-MT at large $n$.

### 6.3 Tier 3 — Roofline `ba_apply`; pick BW-vs-compute target

**The fish.** $76.7$ ms at $n = 2^{20}$ (21 %).

The library has a roofline microbench shader (`gen_roofline_microbench_shader` in `shader_manager.ts`) with three entry points: `mont_throughput` (peak Montgomery-mul throughput), `bandwidth_aos`, `bandwidth_soa`. The BW / Mont ratio tells us whether `ba_apply` is BW-bound.

* If BW-bound: AoS-vs-SoA conversion of the pair pool is the lever. Currently `pair_delta_sb`, `pair_target_meta_sb` are interleaved; splitting to SoA exposes contiguous limb reads.
* If compute-bound: limb-width reduction. WebGPU uses $w = 13$, $L = 20$ (so 80 B per coordinate). The choice of 13 was for `mul_add` carry headroom (24-bit u32 multiply produces 26-bit results, $26 + \lceil\log_2 L\rceil$ fits in 32). Pushing to $w = 16$ gives $L = 16$ (64 B per coord, **20% BW saving**) but the carry analysis has to be redone — WGSL's `u32` mul behaviour requires care.

**Predicted ceiling:** if `ba_apply` shrinks 20 % at $n = 2^{20}$, wall drops $\sim 15$ ms (−4 %). Smaller absolute win than Tier 2 but cheap to investigate.

### 6.4 Tier 4 — GLV / endomorphism decomposition

BN254 has an order-3 endomorphism $\phi: (x, y) \mapsto (\beta x, y)$ where $\beta \in \mathbb{F}_q$ is a primitive cube root of unity. Acting on the order-$r$ subgroup, $\phi(P) = [\lambda_\phi] P$ where $\lambda_\phi$ satisfies $\lambda_\phi^2 + \lambda_\phi + 1 \equiv 0 \pmod r$.

The GLV decomposition writes
$$ s = s_1 + \lambda_\phi s_2 \pmod r, \quad |s_1|, |s_2| \approx 2^{128}, $$
so
$$ [s]P \;=\; [s_1]P + [s_2]\phi(P). $$

For MSM, this means **two scalars per base point, each 128 bits** instead of one at 254 bits. Pre-cache $(P_i, \phi(P_i))$ for all SRS points (free; $\phi$ is one field multiply per $x$). Then:

| | Default | GLV |
|---|---|---|
| Bases | $n$ | $2n$ |
| Effective scalar length $\lambda$ | 254 | 128 |
| $T = \lceil \lambda / c \rceil$ at $c = 15$ | 17 | **9** |
| BPR-1 cost (proportional to $T \cdot B$) | $17 \cdot 2^{14}$ | $9 \cdot 2^{14}$ |
| Stage-1, Stage-2, Stage-3 cost (proportional to $T \cdot n$) | $17 n$ | $9 \cdot 2n = 18 n$ |
| Stage-3 inversions per round | unchanged | unchanged |
| Stage-3 schedule entries | $n$ | $2 n$ |

The savings come from:
1. **BPR-1 cost halved** (and BPR-1 is the largest fixed cost at small $n$).
2. **`subtask_reduce` cost halved** (Horner over $T = 9$ vs $T = 17$).
3. **Two-base-per-scalar** doubles Stage-3 work, but Stage-3 is already linear in $n$ and parallel — the doubling is partially absorbed by the saved per-round overhead.

There's a partial precedent in the codebase: the GLV cold-path entry points (`compute_bn254_msm_glv` and `_glv_with_context`) were *removed* from the bb.js port ([`msm.ts:292-297`](msm.ts#L292-L297) commentary: "removed because the warm SRS-backed path is the only one the Chonk integration exercises"). They depended on `bn254_prepare_glv_inputs` from the old `implementation/cuzk/glv_bn254` module. **Re-wiring GLV on the warm path is greenfield work**, but the underlying mathematics is small.

**Predicted wins** (modelled, no measured back-up):

| $n$ | Default wall | GLV wall (modelled) |
|---|---|---|
| $2^{16}$ | 75 ms | $\sim 55$ ms |
| $2^{20}$ | 397 ms | $\sim 280$ ms |

This is the *biggest* algorithmic lever still on the table. Worth a dedicated workstream.

### 6.5 Tier 5 — Hide `writeBuffer(scalars)` behind GPU work

At $n = 2^{20}$, $32$ MiB of scalars take $\sim 15$ ms to upload. The CPU host wall is $393$ ms vs GPU compute wall $374$ ms — the $\sim 19$ ms gap is mostly this upload + readback bookkeeping.

`device.queue.writeBuffer` is supposed to be async, but the CPU timer shows it as a sync phase. Possibly the WebGPU implementation flushes synchronously on `submit`. If we can issue the upload of *next* MSM's scalars *during* current MSM's GPU work, that 15 ms vanishes at $n = 2^{20}$.

**Predicted ceiling:** $-15$ ms at $n = 2^{20}$ (−4 %).

### 6.6 Tier 6 — Investigate `untimestamped` (4 % at $2^{16}$ to 12 % at $2^{18}$)

At $n = 2^{18}$, $16.5$ ms is happening on the GPU that the per-pass profiler doesn't see. Two leads:

1. The `sample_schedule` / `sample_inverse` / `sample_apply` gates in [`batch_affine.ts:827-865`](cuzk/batch_affine.ts#L827-L865) may only emit timestamps on a subset of rounds. As `MAX_ROUNDS` jumps at the $n \geq 2^{18}$ threshold, unsampled rounds' GPU time becomes the untimestamped column.
2. A non-batch-affine pass (e.g. the indirect-dispatch arg writer) may have no `profiler.stage()` wrapping.

**Action:** temporarily force `sample_*` to true for all rounds and re-sweep. If the untimestamped column collapses, we've found a labellable target; if it doesn't, hunt for the unlabelled pass.

### 6.7 Tier 7 — Lagrange-basis SRS

Honk uses a Lagrange-basis SRS where each $P_i$ is a precomputed elliptic-curve point such that the MSM directly computes a polynomial evaluation at a roots-of-unity domain. If the prover's commitment scheme can supply scalars in Lagrange form, no preprocessing is needed. This is *outside the MSM* but worth flagging: a Lagrange-aware MSM lets the prover skip an iFFT-then-MSM in some flows. Currently not used.

### 6.8 Lower-tier / speculative items

| Item | Status / Note |
|---|---|
| Skewed / NAF scalar decomposition | Marginal at $n \geq 2^{16}$. Bookkeeping cost likely wipes out the digit-count saving. |
| Pippenger window tables ($[k] P_i$ precompute) | Memory-prohibitive at SRS size ($n \times 2^c \cdot 64$ B = 2 TB at $n=2^{20}, c=15$). Could work for very small $c$ ($c=4$, table is $n \times 16 \cdot 64$ B = 1 GiB at $2^{20}$ — still heavy). |
| Multi-GPU dispatch | Browsers expose one `GPUAdapter` per `navigator.gpu`. Not on the table for browser deployment. |

---

## 7. Specialized Scalar Distributions

The default analysis assumed full 254-bit scalars sampled uniformly from $\mathbb{F}_r$. Two non-uniform distributions matter for specific product flows.

### 7.1 Notation for the specialized cases

Add to the prior table:
| Symbol | Meaning |
|---|---|
| $\lambda_{\text{eff}}$ | Effective scalar bit length (length of the largest scalar in the distribution) |
| $\rho$ | Density: fraction of nonzero scalars |
| $\sigma$ | Mean nonzero scalar bit length |
| $n_{\text{nz}}$ | Number of nonzero scalars, $n_{\text{nz}} = \rho \cdot n$ |
| $n_{\text{w}}$ | Number of nonzero *digits* across all $T \cdot n$ chunks; in expectation $n_{\text{w}} \approx (\sigma / c) \cdot n_{\text{nz}}$ for dense $n_{\text{nz}}$ |

### 7.2 Case A — All scalars $\leq 2^{32}$

$\lambda_{\text{eff}} = 32$. The MSM is over $n$ pairs but each $s_i \in [0, 2^{32})$.

**Direct impact on the pipeline.** Two route choices for the implementation, with different $c$ defaults:

| Route | $c$ | $T = \lceil 32/c \rceil$ | $T \cdot B$ (BPR-1 work) |
|---|---|---|---|
| Re-use `glv_override` mechanism as-is | 16 | **2** | $2 \cdot 2^{15} = 65{,}536$ |
| Custom entry-point keeping default $c=15$ | 15 | **3** | $3 \cdot 2^{14} = 49{,}152$ |
| Re-tune $c$ for small $\lambda$ (e.g. $c=11$) | 11 | **3** | $3 \cdot 2^{10} = 3{,}072$ |

For reference, the default ($\lambda = 254$) at $c = 15$ gives $T \cdot B = 17 \cdot 2^{14} = 278{,}528$.

The route choice matters because BPR-1 scales with $T \cdot B$. The re-tuned $c = 11$ route shrinks BPR-1 by another ~16$\times$ at the cost of slightly higher Stage-3 work ($T = 3$ remains the same in this comparison; the saving comes purely from the smaller bucket array per window).

Linear stages (Stage-1, -2, -3) all scale with $T$, so they shrink by $\sim 17 / T$ regardless of $c$.

**Implementation path.** The simplest realization re-uses the existing `glv_override` parameter ([`msm.ts:491-495`](msm.ts#L491-L495)): pass `{ scalar_bit_length: 32, scalar_byte_length: 4, num_subtasks: <recomputed internally> }`. The `using_glv` branch at [`msm.ts:592`](msm.ts#L592) sets $c = 16$ in this case (the GLV path was tuned for $\lambda = 128$ at $c = 16$, but the chunk-size policy generalizes). To get the $c = 15$ (or smaller) variant, a small refactor decoupling chunk-size choice from the `using_glv` flag would be needed — strict 2-line change at [`msm.ts:593`](msm.ts#L593). The decompose shader's top-chunk override formula handles non-aligned $\lambda$ already. **A few lines of orchestration; no new shaders.**

**Modelled wall** at $n = 2^{16}$ on the $c = 16$ route (re-using `glv_override`), $T = 2$:

| Stage | Default ($\lambda = 254$) | $\lambda = 32$, $c = 16$, $T = 2$ |
|---|---|---|
| `decompose_scalars_only` | 0.8 | $\approx 0.1$ ($T = 2$) |
| `transpose_*` | 1.6 | $\approx 0.2$ |
| `ba_init` | 0.6 | 0.6 (scales with $B$, not $n$) |
| `ba_schedule` | 2.0 | $\approx 0.24$ |
| `ba_inverse` | 24.6 | $24.6 \cdot 2/17 \approx 2.9$ |
| `ba_apply` | 7.3 | $7.3 \cdot 2/17 \approx 0.9$ |
| `ba_finalize_*` | 5.3 | $\approx 1$ |
| `bpr_1` | 29.2 | $29.2 \cdot 65{,}536 / 278{,}528 \approx 6.9$ |
| `bpr_2` | 3.2 | $\approx 0.4$ |
| `subtask_reduce` | 2.2 | $\approx 0.3$ |
| **Total modelled** | **75 ms** | **$\sim 14$ ms** |

On the $c = 11$ re-tuned route, BPR-1 drops further to $\sim 0.4$ ms; total $\sim 8$ ms.

The 32-bit case ends up looking like:
```
n = 2^16, λ = 32, c = 16    (~14 ms wall, modelled)
[ba_inv 21%][bpr_1 49%][ba_apply 6%][ba_sched 2%][fixed 22%]
```
BPR-1 is **the** bottleneck in this regime — small $\lambda$ doesn't shrink it, only smaller $c$ does. Hence the value of also re-tuning $c$.

Note: upload cost in the 32-bit case is $n \cdot 4$ B $= 256$ KiB at $n=2^{16}$ — *negligible*. Bandwidth and CPU upload are essentially free in this regime.

**Caveat.** The `bpr_inner_loop` variant choice matters disproportionately at small $\lambda$ — BPR-1 is a larger fraction of the tiny total. `assume_affine` would drop the 23 ms further to maybe 15-18 ms.

### 7.3 Case B — Sparse: 90 % zero, 10 % $\leq 2^{32}$

$\rho = 0.1$. With $n_{\text{nz}} = 0.1 n$ and $\sigma = \lambda_{\text{eff}} = 32$ (uniform over $[1, 2^{32})$), the expected number of nonzero digits is:
$$ n_{\text{w}} \;\approx\; \rho \cdot \frac{\sigma}{c} \cdot n \;\cdot\; \frac{2^c - 1}{2^c} \;\approx\; 0.1 \cdot 2.13 \cdot n \;=\; 0.213 \, n. $$
Compared to dense-uniform-254 ($n_w \approx T n = 17 n$), this is **80$\times$ less inner work**.

**But:** the current WebGPU pipeline gains *almost nothing* from sparsity. Every stage iterates over $n$:
* `decompose_scalars_only`: writes one chunk per (window, point) regardless of whether the scalar is zero. **No savings.**
* `transpose_*`: scans every entry. Zeros end up in bucket 0 / unused buckets, which is a no-op for SMVP — but the scan still touched them.
* `ba_init` / `ba_schedule`: per-bucket; **partial savings** because empty buckets get `active = 0` and the schedule kernel returns early.
* `ba_inverse`: only over actually-queued pairs — **proportional savings**.
* `ba_apply`: only over queued pairs — **proportional savings**.
* `bpr_1`: $O(B)$ per window, independent of $n$. **No savings.**

The story differs sharply per stage:

| Stage | Dense-254 (ms @ $2^{16}$) | Sparse + 32-bit (modelled) | Savings? |
|---|---|---|---|
| `decompose_scalars_only` | 0.8 | 0.8 | None |
| `transpose_*` | 1.6 | 1.6 | None |
| `ba_init` | 0.6 | 0.6 | None |
| `ba_schedule` | 2.0 | 0.2 | Yes ($10\times$) |
| `ba_inverse` | 24.6 | $\sim 1.0$ | Yes ($\sim 24\times$) |
| `ba_apply` | 7.3 | $\sim 0.3$ | Yes ($\sim 24\times$) |
| `ba_finalize` | 5.3 | $\sim 1.0$ | Some |
| `bpr_1` | 29.2 | $5.1$ ($T \cdot B$ scales with $T = 3$) | Partial (from 32-bit, not sparsity) |
| `bpr_2` | 3.2 | 0.6 | $T$-scaling |
| `subtask_reduce` | 2.2 | 0.5 | $T$-scaling |
| **Total** | **75 ms** | **$\sim 12$ ms** | $\sim 6\times$ |

The 12 ms estimate is dominated by stages whose cost is **independent of $\rho$**: decompose, transpose, BPR-1, BPR-2. These are 8.7 ms out of 12 ms.

**A sparse-aware pipeline could roughly halve that.** The single biggest change is a **zero-filter compaction step before decompose**:

```
                  n raw scalars                                  n_nz nonzero scalars + their indices
                       │                                                        │
                       ▼                                                        ▼
              ┌──────────────────┐                              ┌──────────────────────┐
              │  zero filter     │   ───────────────────────▶   │  decompose (on n_nz) │
              │  (1 atomic add)  │                              │  transpose (on n_nz) │
              └──────────────────┘                              │  SMVP (uses index)   │
                                                                └──────────────────────┘
```

A single GPU pass with one `atomicAdd` to a compaction counter and per-thread `compacted_index = atomicAdd(&counter, 1)`. Output: a list of nonzero `(scalar, original_index)` pairs of length $n_{\text{nz}}$. Cost: one pass over $n$, well under 1 ms at $n = 2^{16}$.

The downstream pipeline is then sized to $n_{\text{nz}} = n / 10$. The point indices have to be carried through (instead of the implicit position-equals-index assumption) so SMVP can still find the right base.

**Modelled wall** with zero-filter:

| Stage | After zero-filter |
|---|---|
| zero filter | 0.8 |
| `decompose_scalars_only` | 0.1 |
| `transpose_*` | 0.2 |
| `ba_init` | 0.6 (still scales with $B$, not $n$) |
| `ba_schedule` | 0.2 |
| `ba_inverse` | 1.0 |
| `ba_apply` | 0.3 |
| `ba_finalize` | 1.0 |
| `bpr_1` | 5.1 (no change — fixed in $B$) |
| `bpr_2` | 0.6 |
| `subtask_reduce` | 0.5 |
| **Total modelled** | **$\sim 10.4$ ms** |

The floor is BPR-1, which is now $\sim 50\%$ of total. To shave further, $c$ should shrink: with $c = 8$, $B = 128$, $T = 4$ → BPR-1 cost drops $128\times$. Stage-3 cost rises modestly ($T = 4$ vs $T = 3$). Net win.

For sparse+small workloads, **dynamic chunk-size selection** is the right design — currently `chunk_size` is hard-coded to 15 above $n = 2^{16}$. The MSM driver should pick $c$ as a function of $(n_{\text{nz}}, \lambda_{\text{eff}})$:
$$ c^* \;=\; \arg\min_{c} \;\; T(\lambda_{\text{eff}}, c) \cdot \big(n_{\text{nz}} + \beta \cdot 2^{c-1}\big), $$
with $\beta$ calibrated against the measured BPR-1 cost per bucket.

**Predicted wall at $n = 2^{16}$, sparse + 32-bit + zero-filter + tuned $c$:** roughly **$5\text{-}8$ ms**. That's **$\sim 10\text{-}15\times$ vs the current 75 ms**, and shifts the bottleneck back to per-MSM fixed overhead (encoder bubbles, profiler `untimestamped`) — at which point we're optimizing the wrong thing and should batch many MSMs into a single command buffer.

### 7.4 Implementation cost estimate

| Change | Eng cost | Win at $n = 2^{16}$ |
|---|---|---|
| `bpr_inner_loop = "mixed_safe"` | 1 hour | 8 ms (10%) |
| `bpr_inner_loop = "assume_affine"` (after A/B) | 1 day | 20 ms (27%) |
| Small-scalar `glv_override` path | 2-3 days | (case A) 52 ms / 70% saving |
| Zero-filter compaction + index-aware SMVP | 1-2 weeks | (case B) ~63 ms / 84% saving |
| Dynamic chunk-size selection | 3-5 days (with re-tune of bench harness) | layered on top of others |
| GLV decomposition (full) | 2-4 weeks | (default-case) ~30% across all $n$ |

---

## 8. Conclusions and Recommendations

### 8.1 What the data clearly says

* **Two dominant stages**: BPR-1 (fixed in $n$, $\sim 30$ ms) and `ba_inverse` (linear in $n$, up to $175$ ms). All other optimization wins are at most 5-10 % of the wall.
* **The WebGPU implementation is already competitive at large $n$** (2$\times$ over WASM-MT at $n = 2^{20}$). Adding GLV would push that to 3$\times$.
* **The WebGPU implementation is *not* competitive at small $n$** (parity at $n = 2^{16}$), and most of the small-$n$ gap is BPR-1's fixed cost.
* **Scalar distribution dominates everything else**: for sparse-32-bit workloads, the right pipeline is **10–15× faster than the current one**.

### 8.2 Recommended sequencing (assuming sustained engineering effort)

1. **Week 1** — Wire the `bpr_inner_loop` variants into the dev page. A/B `mixed_safe` (production-safe) and `assume_affine` (faster but Tint-sensitive). Land the conservative one in production.
2. **Week 2** — Diagnose the `untimestamped` jump at $n = 2^{18}$. Force-sample all rounds; chase down any unlabelled passes. Should be a half-day exercise once the dev page exposes the toggle.
3. **Week 2-3** — Investigate `ba_inverse` parallelism budget. Measure `NUM_SUB_WGS` scaling against $n$. Re-tune if there's headroom.
4. **Week 3-4** — Run the roofline microbench on the current device. Decide whether `ba_apply` is BW-bound (→ SoA / limb-width work) or compute-bound (→ Montgomery mul body tightening).
5. **Month 2** — Build the small-scalar entry point (`glv_override`-style with $\lambda = 32$). One-shot win for any product flow that uses small scalars.
6. **Month 2-3** — Build sparse-aware front-end: zero-filter compaction + dynamic chunk-size selection.
7. **Month 3-4** — Full GLV decomposition with $(P, \phi(P))$ pre-cached at SRS load. The biggest algorithmic lever for the dense-uniform-254 case.

### 8.3 Risk register

| Risk | Mitigation |
|---|---|
| `assume_affine` regresses on a specific Tint/Metal codegen | Keep `legacy` as the production default; gate `assume_affine` behind a runtime feature flag and per-browser benchmark check. |
| Limb-width change ($w = 13 \to 16$) breaks carry analysis | Done as a follow-up; mid-engagement. Requires re-validation across all field operations, not just MSM-touched ones. |
| GLV implementation introduces edge cases ($s_2 = 0$, etc.) | Existing `glv_bn254` reference in tal-webgpu can be revived as the source for `bn254_prepare_glv_inputs`. The cuZK pipeline already supports a `glv_override` shape ([`msm.ts:491-495`](msm.ts#L491-L495)). |
| Sparse-pipeline overfits one workload | Build dynamic chunk-size and zero-filter as opt-in front-end stages; default path stays as-is. |
| Browser GPU driver wedges | Already mitigated by `Probe GPU` button + dev-page `[gpu-warm]` diagnostics. |

### 8.4 Out-of-scope / explicitly not recommended

* **Window tables** — memory prohibitive at SRS sizes.
* **Multi-GPU** — not exposed by browsers.
* **WASM SIMD on the bb.js side** — would help WASM-MT close the gap but is orthogonal to WebGPU work; could be picked up by the C++ team independently.
* **Native (non-browser) WebGPU** — the implementation is the same shaders; deployment changes only. Not an MSM-perf question.

---

## Appendix A — File map

| File | What it does |
|---|---|
| [`index.ts`](index.ts) | Public surface: warm/cold entry points + `GpuContext`, `CachedBases`, `ProfileCapture`. |
| [`msm.ts`](msm.ts) | Top-level orchestrator; entry-point functions; `compute_curve_msm` driver. |
| [`cuzk/curve_config.ts`](cuzk/curve_config.ts) | BN254 constants and field parameters. |
| [`cuzk/shader_manager.ts`](cuzk/shader_manager.ts) | Mustache-renders WGSL templates with $w$, $L$, $c$, $T$, etc. |
| [`cuzk/gpu_context.ts`](cuzk/gpu_context.ts) | Persistent `GPUDevice` + pipeline + buffer + bind-group caches. |
| [`cuzk/cached_bases.ts`](cuzk/cached_bases.ts) | SRS precomputation: one-time Montgomery convert. |
| [`cuzk/batch_affine.ts`](cuzk/batch_affine.ts) | Batch-affine SMVP host driver (init → rounds → finalize). |
| [`cuzk/bn254.ts`](cuzk/bn254.ts) | CPU-side BN254 reference (for cross-validation only). |
| [`wgsl/`](wgsl/) | All WGSL shader sources. |
| [`dev/msm-webgpu/`](../../dev/msm-webgpu/) | In-browser comparison harness against bb.js WASM Pippenger. |

## Appendix B — Glossary

* **Affine point**: $(x, y)$ on the curve, with implicit normalization. Cheaper to add than Jacobian when batched.
* **Jacobian point**: $(X, Y, Z)$ representing $(X/Z^2, Y/Z^3)$. No-inversion adds.
* **Mixed add**: adding a Jacobian point and an affine point. Cheaper than two Jacobian adds.
* **SMVP**: Sparse Matrix-Vector Product. In MSM, the matrix is the bucket-membership matrix and the vector is the base points.
* **CSR / CSC**: Compressed Sparse Row / Column. Compact representations of a sparse matrix.
* **Montgomery form**: $\tilde a = a \cdot R \bmod q$. Multiplication in this form avoids modular reduction by raw division.
* **Barrett reduction**: Modular reduction trick used to convert into Montgomery form.
* **NAF / Booth recoding**: Non-Adjacent Form / Booth's encoding. Signed-digit recodings reducing nonzero-digit density.
* **GLV**: Gallant-Lambert-Vanstone. Endomorphism-based scalar decomposition halving effective scalar length.
* **cuZK**: A GPU MSM pipeline structure introduced by the cuZK paper ([Lu et al., 2023](https://eprint.iacr.org/2022/1321)).

---

*Last updated: as of branch `sb/msm-webgpu`. All references and constants verified against the source tree at the time of writing. The 2 % discrepancy between `BBERG_PIPPENGER.md`'s "400 KB" scratch buffer claim and the source's ~200 KB is the only material doc/source drift identified during preparation.*
