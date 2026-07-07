# WebGPU MSM — The Algorithm

The **mathematics** of the multi-scalar multiplication (MSM) we run on the
GPU, how that math maps onto **WebGPU compute passes**, and **where the MSM
sits** in the Chonk (client-IVC) browser prover. It is meant to be read
top-to-bottom by someone new to the code, and it is deliberately
implementation-state-free: nothing here changes unless the *algorithm*
changes.

The companion is [MSM_IMPL.md](MSM_IMPL.md) — the current state of the
implementation: what is built and working, per-kernel and bridge reference,
performance across devices, integration mechanics, everything that was
tried and parked, and how to build/run/test. Read this doc first, that one
second. Claims that name a file, symbol, or constant are checked against
the tree on `sb/integrate-wgpu-msm`. A sibling doc,
[SUMCHECK_ALGO.md](SUMCHECK_ALGO.md), covers the GPU **sumcheck**
prototype (parked; code on the `sb/*sumcheck*` branches) the same way.

---

## 0. Notation

| Symbol | Meaning |
|---|---|
| $\mathbb{F}_q$ | BN254 base field (point coordinates), $\log_2 q \approx 254$. |
| $\mathbb{F}_r$ | BN254 scalar field, $\log_2 r \approx 254$. |
| $\mathbb{G}_1$ | BN254 group of order $r$, $y^2 = x^3 + 3$. |
| $n$ | Number of $(P_i, s_i)$ pairs in one MSM. |
| $P_i,\; s_i$ | Base points $P_i \in \mathbb{G}_1$ (an SRS prefix) and scalars $s_i \in \mathbb{F}_r$, $i \in [0, n)$. |
| $\lambda$ | Scalar bit width; BN254: $\lambda = 254$. |
| $c$ | Pippenger **window width** (bits per digit); $c = \mathrm{pickC}(n)$. |
| $T$ | **Windows**, $T = \lceil \lambda / c \rceil$. |
| $B$ | **Buckets** per window, $B = 2^{c-1}$ (signed digits). |
| $s_{i,j}$ | Signed digit of $s_i$ in window $j$, $\lvert s_{i,j} \rvert \in [0, 2^{c-1}]$. |
| $B_{j,k}$ | Bucket sum: all points whose window-$j$ digit has magnitude $k$. |
| $W_j$ | Per-window sum, $W_j = \sum_k k\,B_{j,k}$. |
| $S$ | The MSM result, $S = \sum_i [s_i]\,P_i \in \mathbb{G}_1$. |
| $R$ | Montgomery radix, $R = 2^{260} \bmod q$ ($2^{20 \times 13}$ for the GPU's 20-limb × 13-bit field layout — see [MSM_IMPL.md](MSM_IMPL.md)). |

The problem, and the windowed identity the whole pipeline computes:

$$
S = \sum_{i=0}^{n-1} [s_i]\,P_i,
\qquad
s_i = \sum_{j=0}^{T-1} s_{i,j}\,2^{jc}
\;\Longrightarrow\;
S = \sum_{j=0}^{T-1} 2^{jc}\, W_j,
\qquad
W_j = \sum_{i} [s_{i,j}]\,P_i.
$$

---

## 1. The mathematics

![The windowed-Pippenger MSM rewritten as a top-to-bottom flow of algebraic identities: input S = Σ [s_i] P_i, then (1) window the scalars into T digits so the sum factors per window, (2) signed-Booth recode each digit into [−2^(c−1), 2^(c−1)], (3) accumulate a bucket B_{j,k} per digit magnitude, (4) weight the buckets by a running suffix sum W_j = Σ k B_{j,k}, (5) Horner-combine the windows into S; a side callout gives the affine-addition primitive μ,x₃,y₃ and a right column tracks the BN254 sizing (λ=254, c=8–15, T≈20–32, B=128–4096) and per-stage cost.](diagrams/msm_math_flow.svg)

### 1.1 Why not the naive way

Computing each $[s_i]\,P_i$ by double-and-add and summing costs
$\approx \lambda$ point additions per term, $\Theta(n\lambda)$ total.
Pippenger replaces the per-point scalar multiplications with a shared
bucketing pass costing $\Theta\!\bigl(\tfrac{\lambda}{c}(n + 2^{c})\bigr)$
additions — at the optimal $c \approx \log_2 n$ that is
$\Theta(n\lambda/\log n)$, a $\log n$-factor saving over naive. The whole
kernel is built to exploit that structure.

### 1.2 Windowed Pippenger

Cut each scalar into $T = \lceil \lambda / c \rceil$ digits of $c$ bits.
Because a digit is a property of the *scalar*, the same digit multiplies
every point, so the double sum factors: instead of $n$ independent
scalar multiplications we get $T$ **window sums** $W_j = \sum_i [s_{i,j}]\,P_i$,
recombined by a single Horner fold $S = \sum_j 2^{jc} W_j$. All
the work now lives inside computing the $W_j$.

### 1.3 Signed-digit (Booth) recoding

A plain $c$-bit digit ranges over $[0, 2^c)$, needing $2^c$ buckets.
**Signed** recoding maps each digit into $[-2^{c-1}, 2^{c-1}]$: a digit
above $2^{c-1}$ is expressed as a negative digit plus a carry into the
next window. Negation is free on an elliptic curve ($-P = (x, -y)$), so a
negative digit just adds $-P_i$. This halves the buckets to $B = 2^{c-1}$
— the dominant $2^c$ term in the cost, cut in two.

The GPU computes each digit **carry-free**: it is a pure function of $c+1$
bits of $s$ — window $j$'s own $c$ bits plus one *lookback* bit taken
directly from the scalar. Write the window's raw value and the lookback
(the top bit of the window below, $0$ for $j = 0$):

$$
\mathrm{win}_j = \Bigl\lfloor \tfrac{s}{2^{jc}} \Bigr\rfloor \bmod 2^c,
\qquad
\mathrm{lb}_j = \Bigl\lfloor \tfrac{s}{2^{jc-1}} \Bigr\rfloor \bmod 2 .
$$

The sign comes from the window's top bit; the bucket index is the
magnitude:

$$
\mathrm{neg}_j = \Bigl\lfloor \tfrac{\mathrm{win}_j}{2^{c-1}} \Bigr\rfloor \in \{0,1\},
\qquad
k_j = \mathrm{bucket}_j =
\begin{cases}
\mathrm{win}_j + \mathrm{lb}_j & \mathrm{neg}_j = 0 \\
2^c - (\mathrm{win}_j + \mathrm{lb}_j) & \mathrm{neg}_j = 1
\end{cases},
\qquad
s_{i,j} = (-1)^{\mathrm{neg}_j}\, k_j ,
$$

giving $k_j \in [0, 2^{c-1}]$ and $s_{i,j} \in [-2^{c-1}, 2^{c-1}]$. The
key property: $\mathrm{lb}_j$ (bit $jc-1$ of $s$) *is* window $j-1$'s
carry-out, but window $j$ reads it off the scalar instead of waiting for
window $j-1$. So every $(i, j)$ digit is independent — one GPU thread
each, no carry chain. As long as the top window keeps a spare padding bit
above the scalar ($Tc > \lambda$, which every BN254 $c$ satisfies), the
recoding is an exact integer identity $s = \sum_j s_{i,j}\, 2^{jc}$.

For example, take $s = 31 = (011111)_2$ with $c = 3$ over $T = 2$
windows. Window 0 reads $\mathrm{win}_0 = 7$ and $\mathrm{lb}_0 = 0$, so
its top bit gives $\mathrm{neg}_0 = 1$ and $s_0 = -(2^3 - 7) = -1$.
Window 1 reads $\mathrm{win}_1 = 3$ and $\mathrm{lb}_1 = 1$ (bit $2$ of
$s$), so $\mathrm{neg}_1 = 0$ and $s_1 = 3 + 1 = +4$. Then
$s_0 + s_1\, 2^3 = -1 + 32 = 31$ — window 0's borrow is repaid by window
1's lookback, with no sequential carry.

![Bit-level view of the signed-Booth recoding of s = 31 = (011111)₂ with c = 3. The six bits split into window j=1 (bits 5–3, high) and window j=0 (bits 2–0, low); bit 2 is highlighted because it is simultaneously window 0's sign bit and window 1's lookback. Two panels compute each digit — window 1: win=(011)₂=3, +lookback 1, top bit 0 so neg=0, giving s₁=+4; window 0: win=(111)₂=7, lookback 0, top bit 1 so neg=1, giving s₀=−(2³−7)=−1 — and the bar reconstructs S = s₀·2⁰ + s₁·2³ = −1 + 32 = 31. The shared bit 2 is window 0's carry-out read directly as window 1's lookback, so the digits never wait on each other.](diagrams/msm_booth_windows.svg)

### 1.4 Bucket accumulation and the suffix-sum trick

Within window $j$, group points by digit magnitude and sum each group:

$$
B_{j,k} = \sum_{i\,:\,s_{i,j}=k} P_i \;-\; \sum_{i\,:\,s_{i,j}=-k} P_i,
\qquad k \in [1, B].
$$

The window sum is then $W_j = \sum_{k=1}^{B} k\,B_{j,k}$. Computing that
weighted sum naively would reintroduce scalar multiplications. Instead a
**suffix sum** reuses each partial:

$$
W_j = \sum_{k=1}^{B} k\,B_{j,k} = \sum_{k=1}^{B}\Bigl(\sum_{\ell \ge k} B_{j,\ell}\Bigr),
$$

turning $B$ multiplications into $\approx 2B$ additions. So *every* step
of Pippenger — decompose, accumulate, reduce, combine — is expressible
in point **additions** alone. That is what makes a batched affine-add
primitive (§1.5) the single hot operation.

### 1.5 The primitive: batched affine addition

On $y^2 = x^3 + 3$ ($a = 0$), one affine addition is

$$
\mu = \frac{y_2 - y_1}{x_2 - x_1},\qquad
x_3 = \mu^2 - x_1 - x_2,\qquad
y_3 = \mu(x_1 - x_3) - y_1.
$$

The division is a field inversion — the expensive op. **Montgomery's
trick** amortises it over $m$ independent pairs with a forward
prefix-product, one inversion, and a backward peel:

$$
\pi_k = \prod_{t \le k}(x_{2,t}-x_{1,t}),\quad
\rho_m = \pi_m^{-1},\quad
(x_{2,k}-x_{1,k})^{-1} = \pi_{k-1}\,\rho_k,\quad \rho_{k-1}=\rho_k(x_{2,k}-x_{1,k}).
$$

so $m$ additions cost $1$ inversion $+\,O(m)$ multiplications. A whole
bucket of $N$ points is folded to its sum $B_{j,k}$ by a **pair tree**:
each level pairs up the survivors, batch-adds, halves the count, and
carries the odd one up — $\lceil \log_2 N\rceil$ levels, one shared
inversion per batch of pairs at each level.

Concretely, fix one window $j$ and lay its digits out. Each point's
signed digit names exactly one bucket, so window $j$ *is* a sparse
matrix: one signed entry per row, at column
$\lvert s_{i,j}\rvert \in [0, B]$ — a zero digit lands in column $0$,
whose weight in $W_j = \sum_k k\,B_{j,k}$ is zero, so it is never
accumulated. A bucket is a **column** of that matrix, and summing the
column is precisely the pair-tree fold just described. The matrix below
is cell-for-cell the highlighted window slice of the tensor figure in
§1.6 — same 20 rows, same bucket columns, same red column $k=3$.

![One window's digits as a sparse matrix: twenty points P0..P19 listed with their signed Booth digits, each row marking one cell of a 20×10 grid at bucket column |s_ij| with a green + or red − mark — the exact cell pattern of the tensor figure's highlighted slice. Digit-0 rows (P4, P13) get a muted mark in bucket 0, whose weight in W_j = Σ k·B_k is zero, so it is never accumulated. Column k=3 is highlighted in red with the tensor's five rows — +P0, −P3, +P8, +P11, −P14 — which fold up a pair tree on the right (amber pair-sums (P0,−P3) and (P8,P11), the dashed edge carrying the odd −P14 to the root) to the bucket sum B_{j,3} = P0 − P3 + P8 + P11 − P14. Each tree level is drawn as a dotted batch row tagged "1 inv": a teal inset spells out the Montgomery trick — Δᵢ = x₂ᵢ − x₁ᵢ per pair-add, forward prefix products πₘ and the level's only inversion ρₘ = πₘ⁻¹, then the backward peel Δᵢ⁻¹ = πᵢ₋₁ ρᵢ — and a footnote notes that in the kernel each batch spans every bucket of every window at that level.](diagrams/msm_window_matrix.svg)

### 1.6 Putting the parameters together

The bucket membership is an extremely sparse 3-D tensor $M_{i,k,j}$ —
"point $i$ lands in bucket $k$ of window $j$", exactly one nonzero per
$(i, j)$. Fixing a window gives a sparse matrix; the implementation
transposes it (point-major → bucket-major) so a bucket's points are
contiguous, then pair-tree-sums each column.

The tensor is also the **map of the parallelism**. The carry-free
recoding (§1.3) makes the $T$ window slices mutually independent, and
within a slice every bucket column touches a disjoint set of points —
so all $T \cdot B$ column folds (4k–80k of them at Chonk sizes) can climb
their pair trees **concurrently**: the figure shows one tree over one
column, but every column of every slice grows one at the same time. The
GPU exploits exactly this — each tree level is a single dispatch whose
threads work pair-blocks drawn from *all* buckets of *all* windows at
once (§2, stage 5); nothing synchronises across columns until the
per-window reduction of §1.4.

The figure below is that tensor: one window slice highlighted, one
bucket's five points folding up a pair tree.

![The cuZK bucket-membership tensor M in {0,1}^(n×B×T): a highlighted blue plane is one window slice M^(j); a red column is bucket k=3, whose five points P0, P3, P8, P11, P14 fold up a four-level pair tree (solid edges are batched pair-sums, the dashed edge is the odd-count carry) to the bucket sum B_{j,k}. Axes: i = n inputs, j = T windows, k = B buckets. Every column of every slice folds like this concurrently — the two free axes, j and k, are the GPU's parallelism.](diagrams/tensor_cube.svg)

The window width $c$ trades the two cost terms: larger $c$ means fewer
windows $T$ (cheaper combine) but exponentially more buckets $B = 2^{c-1}$
(costlier accumulate/reduce). `pickC` ([msm_v2.ts](../msm_v2.ts))
tabulates the optimum per $n$: $c \in \{4,5\}$ at tiny $n$, $c = 8\!-\!13$
across Chonk's $n = 2^{14}\!-\!2^{17}$ band ($T \approx 20\!-\!32$,
$B \approx 128\!-\!4096$), $c = 15$ at $n \approx 2^{18}\!-\!2^{20}$.

---

## 2. From math to GPU passes

The implementation, `MsmV2`, is a **cuZK-derived, memory-bounded
Pippenger** run entirely as WebGPU compute passes. cuZK's contribution is
the *transpose*: treat each window as a sparse matrix and convert
point-major (CSR) to bucket-major (CSC) so bucket accumulation reads
contiguous points. MsmV2 keeps that transpose and replaces cuZK's sparse
mat-vec with the **pair-tree** accumulate of §1.5. That
"transpose-then-pair-tree" shape is the whole pipeline; each stage below
is one-to-one with a step of §1.

![The MsmV2 GPU pipeline: a one-per-session SRS pool feeds an untimed prepare() (bucket histogram + host plan) and a timed run() spine — decompose_scalars_booth, a four-pass tiled counting-sort transpose, csr_to_v2, the per-level pair-tree accumulate (planner, ba_fused_super, carry/finalize), the branchless bucket reduction, window-sum gather, and a native bb::g1 Horner combine — with field-arithmetic and lifecycle side panels.](diagrams/wgpu_pipeline.svg)

1. **SRS pool** (once per session) — convert every SRS point into the
   GPU's Montgomery form. The only Montgomery conversion in the system.
2. **Decompose** — the carry-free signed-Booth of §1.3, one thread per
   $(point, window)$ digit.
3. **Transpose** — a four-pass tiled **counting sort** (count → reduce →
   scan → scatter) turning the point-major digit table into the
   bucket-major inverse: for each bucket, the contiguous list of its
   points. Workgroup-shared histograms keep it $O(n)$ and near
   contention-free.
4. **Layout convert** — materialise the bucket-major point buffer the
   pair tree consumes, plus per-bucket counts and offsets for the
   planner. At the first level points are 4-byte $(index \mid sign)$
   handles into the SRS pool, not 64-byte coordinates.
5. **Pair-tree accumulate** (one dispatch group per level) — the §1.5
   core. A planner bin-packs the level's pairs across *all* buckets of
   *all* windows into fixed $S$-pair blocks; the fused kernel runs one
   block per thread with **exactly one field inversion** (forward
   prefix-product → one inverse → backward peel → affine adds). Odd
   leftovers carry up; a bucket is harvested the level it reaches
   count 1. There is deliberately **no $P = \pm Q$ fallback** — a stated
   production contract (SRS-backed, collision-free inputs); callers that
   can violate it never delegate.
6. **Reduce + combine** — the branchless suffix sum of §1.4 produces each
   $W_j$ on the GPU; the tiny final fold $S = \sum_j 2^{jc} W_j$
   ($T \le 64$ points) runs *natively on the CPU* as a Horner fold in
   inversion-free Jacobian coordinates — a GPU dispatch + readback would
   dominate it.

Everything below this level — kernel names, bind groups, dispatch shapes,
the field-arithmetic representation (20×13-bit limbs, Karatsuba-Yuval
Montgomery multiply, safegcd inversion), buffer lifecycle, batching modes
— is implementation, and lives in [MSM_IMPL.md](MSM_IMPL.md).

---

## 3. Where the MSM sits in Chonk

### 3.1 Origin and shape of the MSMs

Chonk (client-IVC) proves ~11 circuits per proof (Mega + ECCVM +
Translator). Every polynomial commitment is a
`CommitmentKey::batch_commit`, which is where MSMs originate — **~91 per
proof**, issued in batches of ~10. In the canonical flows they all sit in
the $n = 2^{14}\!-\!2^{17}$ band (the heaviest flow's wire commits reach
$n \approx 2^{18.5}$), and the base points are always a **prefix
of one fixed SRS** (so points are linearly independent — that is what
justifies dropping the $P = \pm Q$ fallback above, and what lets one
GPU-resident SRS pool serve every commit as a prefix-with-offset).

The *scalars*, however, are not uniform random. Binning one real prove's
659 MSMs by scalar shape — how sparse the vector is, and how large its
nonzeros are — and weighting each bin by its share of the total MSM work:
only ~29% of the work has mostly full-width scalars, the uniform regime
a GPU bucket pipeline is happiest in. ~49% has mostly-*small* scalars —
the single biggest bin (41%) is dense-but-small (lookup counts, tags,
selector columns), and the translator range-constraint group fills the
sparse-small corner, with a handful of full-width ZK-masking rows mixed
in. None of that smallness is exploited: the pipeline runs full 254-bit
windows regardless. This structure is why several of the experiments
catalogued in [MSM_IMPL.md](MSM_IMPL.md) §7 (scalar masking, skew-split,
compaction) exist.

![A 3×3 work-share heatmap of 659 MSMs from one Chonk prove, binned by scalar sparsity (dense / semi / sparse columns) × nonzero magnitude (mostly full-width / mixed / mostly small rows); each cell shows its share of total MSM work and its MSM count, shaded amber by share. Row totals on the right: mostly full-width 29%, mixed 20%, mostly small 49%. The hottest cell (41%, 234 MSMs) is dense × mostly-small, tagged tags·selectors·lookups; wires and z_perm are tagged in the full-width row; the translator masking band is tagged at sparse × mostly-small. A takeaway column repeats the reading: only 29% is the kernel's favourite uniform full-width regime, 49% is small scalars still run at full width.](diagrams/msm_scalar_shapes.svg)

### 3.2 The delegation point

The prover is C++ compiled to threaded WASM, running in a Web Worker; the
GPU lives in JavaScript on the browser's main thread. There is exactly
**one delegation point**: the BN254 specialisation of
`MSM::batch_multi_scalar_mul`. Each MSM is either routed across a
worker↔main-thread **bridge** to the GPU pipeline, or stays on the
in-tree multithreaded Pippenger — same result either way, and the choice
is invisible to the caller. Everything crossing the bridge boundary is
**little-endian, non-Montgomery** bytes; the GPU returns the $T$
per-window sums and C++ Horner-combines them natively.

![Integrating the MSM into a Chonk prove: a one-time bb.js init band wires the bridge (setupWebGpuMsmBridge on the main thread, installWorkerStub in the worker, bb_set_webgpu_msm_enabled(1), and webgpu_register_full_srs_bn254); then per MSM the worker's ClientIVC prove → CommitmentKey::batch_commit → MSM<BN254>::batch_multi_scalar_mul hits one delegation gate. If curve=BN254, runtime-enabled, not an edge case, n≥2¹⁴, an SRS prefix, and not block-listed, it crosses the C++↔GPU bridge to MsmV2/BatchMsmV2; otherwise it runs the native Pippenger. Both paths converge at native combine_windows, returning the commitment to the prove.](diagrams/msm_chonk_integration.svg)

The gate is layered so the standard published bb.js is byte-for-byte
unaffected: a compile flag, a runtime flag, and a per-MSM filter (size
threshold, SRS-prefix check, label block-list). The full mechanics of the
gate, the bridge protocol, the SRS lifecycle, and the batch dispatch modes
are in [MSM_IMPL.md](MSM_IMPL.md) §4.

### 3.3 What that means for the win

Two structural facts, both consequences of *where* the MSM sits rather
than how fast the kernel is, bound what GPU offload can buy:

- **Size.** Chonk's MSMs all sit below the GPU-saturation point
  ($\sim 2^{18}$), where warm GPU compute is at parity with multithreaded
  WASM — the kernel's isolated 2–4× win lives at sizes Chonk never issues.
- **Amdahl.** The prove is ~80% sequential, so MSM offload is capped at
  ~15–20% of end-to-end even if the MSM were free.

The measured consequences (parity on Apple/Adreno, the per-device story,
and where the GPU path *does* pay off) are in
[MSM_IMPL.md](MSM_IMPL.md) §2 and §5.

---

*Diagrams are SVG (dark-mode, self-contained; equations typeset with MathJax to
inline glyph paths, so their notation matches this doc's `$…$` math) generated by
[diagrams/gen_msm_algo_diagrams.mjs](diagrams/gen_msm_algo_diagrams.mjs)
(math-flow, Booth-windows, chonk-integration, scalar-shapes,
window-matrix) and
[diagrams/gen_wgpu_diagrams.mjs](diagrams/gen_wgpu_diagrams.mjs) (pipeline,
bridge); the tensor cube is TikZ
([diagrams/tensor_cube.tex](diagrams/tensor_cube.tex)).*
