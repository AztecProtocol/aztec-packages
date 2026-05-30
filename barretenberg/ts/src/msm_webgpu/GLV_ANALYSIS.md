# GLV endomorphism decomposition for the WebGPU BN254 MSM

> Design-space survey, justification for the mobile/laptop GPU constraints, and
> the implementation + correctness results landed in this PR. Companion to
> [`MSM_DESIGN_ANALYSIS.md`](./MSM_DESIGN_ANALYSIS.md), whose profile and stage
> taxonomy this builds on.

## 1. Problem and constraints

Target: a BN254 MSM that is fast **and** memory-bounded across laptop and the
last ~3 years of phone GPUs — Apple A/M (TBDR), Qualcomm Adreno, ARM Mali. The
binding constraints:

- **Workgroup/shared memory**: 32 KB on Apple/Adreno, **16 KB on Mali Bifrost**
  (forces TPB ≤ 64 there).
- **Total memory budget**: ≤ 100 MB of algorithm working set up to n = 2²⁰
  (excludes the unavoidable SRS).
- Weaker ALUs and smaller occupancy than a desktop dGPU, so **fixed,
  n-independent per-dispatch costs are a larger fraction of the wall** at the
  moderate n (2¹⁴–2¹⁸) typical of mobile proving.

The base branch already carries two accumulators (see `MSM_DESIGN_ANALYSIS.md`):
a fast but memory-heavy **V2 pair-tree** (~62 MB algo buffers @ 2¹⁷) and a
memory-light but slower **stream-walker** (~9 MB @ 2¹⁷). The goal is an algorithm
that is good on both axes.

## 2. Design-space survey

| Technique | What it changes | Fit for the mobile constraints |
|---|---|---|
| **Pippenger / bucket method** (baseline) | Group points by c-bit window digit into 2^(c-1) signed buckets, sum buckets weighted, Horner across T = ⌈λ/c⌉ windows. | The substrate everything here uses. Bucket count 2^(c-1) sets the per-window memory and the BPR cost. |
| **cuZK** (sparse-matrix SMVP) | Casts bucketing as an SpMV over a CSR/CSC matrix; the WebGPU pipeline's transpose→SMVP→BPR is cuZK-derived. | Already adopted. The parallel CSR→CSC transpose is what makes the GPU path competitive. Orthogonal to the levers below. |
| **Signed-digit / NAF recoding** | Halves bucket count to 2^(c-1) by allowing ±digits (free point negation y→−y in affine). | Already used (carry-free signed-Booth, `decompose_scalars_booth.wgsl`). Marginal extra NAF gains are eaten by bookkeeping at n ≥ 2¹⁶. |
| **Booth recoding** | The specific constant-time signed-window encoding used. | Already used; carry-free so every (point,window) digit is independent — embarrassingly parallel. |
| **Montgomery batched inversion** | Amortizes one Fq inversion across m affine adds: per-add cost 3\|M\| + \|I\|/m. | Already the core of both accumulators. The single biggest reason the inner loop is competitive. |
| **GLV / endomorphism** | φ(x,y)=(βx,y)=[λ]P splits s = s₁+λs₂ with \|sᵢ\|≈2¹²⁷, so [s]P=[s₁]P+[s₂]φ(P). Two ~127-bit scalars per base ⇒ **T halves**. | **Chosen.** φ is one Fq-mul per point; halving T directly cuts the n-independent BPR + Horner work that dominates on mobile. Composes with everything above. |
| **Window precompute tables ([k]Pᵢ)** | Trade memory for fewer adds. | **Rejected**: table is n·2^c·64 B — TBs at SRS scale; even c=4 is ~1 GiB @ 2²⁰. Violates the budget. |
| **Lagrange-basis SRS** | Skips an iFFT in some prover flows. | Outside the MSM; not actionable here. |

Of the levers not already in the pipeline, **GLV is the only one that is both
memory-safe and a constant-factor win on the dominant mobile cost** — it is
called out in `MSM_DESIGN_ANALYSIS.md §6.4` as "the biggest algorithmic lever
still on the table."

## 3. Why GLV, precisely — what it does and does NOT speed up

Decompose every 254-bit scalar into two signed ~127-bit half-scalars and pair
the second with φ(P). An n-point/254-bit MSM becomes a **2n-point/127-bit** MSM.
With c = 15: **T = ⌈254/15⌉ = 17 → ⌈128/15⌉ = 9**.

The honest accounting (per Pippenger stage; see the §5.2 profile in the
companion doc):

| Stage | Cost ∝ | Under GLV (T→T/2, n→2n) | Effect |
|---|---|---|---|
| decompose, transpose | T·n | (T/2)·(2n) = T·n | **unchanged** |
| bucket accumulate (SMVP / stream-walker) | T·n digits | (T/2)·(2n) = T·n | **unchanged** |
| **BPR bucket-reduction** | T·B = T·2^(c-1) | halves | **÷2** |
| **Horner / subtask_reduce** | T | halves | **÷2** |

So GLV does **not** touch the O(T·n) accumulate work (the stream-walker's
bottleneck) — it halves the **n-independent** BPR + Horner stages. That is
exactly the right target for mobile: those fixed costs are **37 % + ~5 % of the
wall at n = 2¹⁶** on the measured desktop profile and a *larger* fraction on
weaker GPUs at moderate n. Modelled wall (companion §6.4): **75 → 55 ms @ 2¹⁶**,
**397 → 280 ms @ 2²⁰**.

GLV is therefore a **win on the n-independent stages on both axes**: it halves
their *time* (BPR + Horner) and, at the production c = 15, halves the T-scaled
*memory* they consume (§4). It is composable with either accumulator. It does
not change the O(T·n) accumulate inner loop — so it complements, rather than
replaces, work on the stream-walker's accumulate bottleneck.

## 4. Memory

GLV's memory effect is c-dependent, so it must be measured at the production
c = 15 (B = 2¹⁴), not at the small c that a tiny n would pick:

- **Per-window bucket buffers** (`bucket_sums` ∝ T·B, BPR scratch, reduce
  buffers) **halve** with T. At c = 15 these dominate the working set.
- **Per-point buffers** (`l0_index`, `val_idx`, scalar digits ∝ n) and the
  materialized point pool **double** with the 2n set.

**Measured** total GPU working set (`MsmV2Pool.statsBytes()`, which sums every
allocated storage buffer; SwiftShader build, c = 15, n = 2¹⁷):

| Config | T | points | total working set |
|---|---|---|---|
| Baseline (n = 2¹⁷, 254-bit) | 17 | 2¹⁷ (8 MiB) | **101.4 MiB** |
| GLV (2n = 2¹⁸, 127-bit) | 9 | 2¹⁸ (16 MiB) | **89.6 MiB** |

At c = 15 the T-scaled bucket buffers outweigh the doubled point set: GLV's
**scratch drops ~21 %** (93.4 → 73.6 MiB) and the **total drops ~12 %** even
while carrying 2× the points — bringing n = 2¹⁷ back **under the 100 MB budget**
that the baseline already exceeds. Computing φ(P) on-the-fly instead of storing
it (§6) removes the +8 MiB point doubling, taking the total to ~81 MiB (≈ −20 %).

(At small c — e.g. c = 8, which `pickC` selects at tiny n — the bucket buffers
are negligible and the scratch is instead ~flat; that regime does not represent
the production config and is not the basis for the numbers above.)

## 5. Implementation and correctness

**Code.**
- `src/msm_webgpu/cuzk/glv_bn254.ts` — the decomposition: verified β (Fq cube
  root of unity), the short GLV lattice basis (extended-Euclidean short vectors,
  det = r, |v₁|,|v₂| ≈ 2¹²⁶·⁸), `glvSplit`, `endoPoint`, and `buildGlvInputs`
  which produces the 2n-point/127-bit problem with the sign of each half-scalar
  folded into its point (y→−y) so the pipeline sees non-negative magnitudes.
- `src/msm_webgpu/msm_v2.ts` — a `scalarBitLength` knob on `MsmConfig`
  (default 254; the pipeline already derives everything from
  `numWindows = ⌈scalarBitLength/c⌉`, so this is the entire core change).
- `dev/msm-webgpu/main.ts` — autorun modes `gpu-vs-noble-glv` (correctness) and
  `glv-compare` (memory/time A/B), plus a GPU-less `gpu-vs-noble` path.

**Math, verified offline against noble** (`glvSplit`/`endoPoint`):
φ(P)=[λ²]P for the chosen β; s₁+λ²s₂ ≡ s (mod r) on 2000 random scalars with max
half-scalar 126 bits; full [s]P = [s₁]P+[s₂]φ(P) reconstruction on real points.

**End-to-end correctness under headless SwiftShader** (software Vulkan; the dev
box has no GPU), GLV pipeline output cross-checked against the noble CPU
Pippenger reference on the original n-point/254-bit problem:

| logn | n → 2n | T (windows) | GLV vs Noble |
|---|---|---|---|
| 8 | 256 → 512 | 26 (c=5) | ✅ agree |
| 10 | 1024 → 2048 | 16 (c=8) | ✅ agree |

(The c=15/T=9 production config needs n ≳ 2¹⁷ to be well-sized — at tiny n the
stream-walker's partials-transpose buffer is sized for n and the 2¹⁴-bucket
matrix overflows it, an artifact of forcing c=15 at n=256, unrelated to GLV.
SwiftShader is too slow to run 2¹⁷ end-to-end, so T=9 is validated at scale on
BrowserStack; see the PR's results section.)

## 6. Production follow-ups (not in this PR)

This PR lands a **correct, measurable** GLV path with the decomposition on the
CPU front-end. To make it production-grade on the warm SRS-backed (Chonk) path:

1. **GPU scalar split** in `decompose` (Babai rounding is a handful of 256-bit
   mul/round ops) — removes the per-MSM CPU cost.
2. **On-the-fly φ(P)** in the gather (`csr_to_v2_active_sums`) instead of a 2n
   point pool — removes the point-storage doubling, making memory a strict win.
3. **GPU half-scalar sign**: fold the per-base GLV sign into the existing
   per-digit sign bit so the persistent SRS pool is reused unmodified across
   MSMs with different scalars.
4. Re-tune `pickC` for the 2n-point/127-bit shape (the optimum c may shift).
