# Mobile-first BN254 WebGPU MSM — design

> Goal: a **memory- and time-optimal** BN254 multi-scalar multiplication for
> laptop and phone GPUs (Apple A/M TBDR, Qualcomm Adreno, ARM Mali), optimizing
> the **memory × time product** under a ≤100 MB *algorithm-buffer* budget and a
> 16/32 KB workgroup-memory limit, up to n = 2²⁰.
>
> This document states the design from first principles, the headline lever
> (GLV), the memory budget that justifies every scaling buffer, the
> per-architecture knobs, and an explicit, honest status of what is validated
> vs. modelled vs. designed.

## 1. Constraints, restated

| Constraint | Value | Consequence |
|---|---|---|
| Workgroup-shared memory | 32 KB (Apple/Adreno), **16 KB (Mali Bifrost)** | `TPB ≤ 64` on Mali; 128 elsewhere |
| Algorithm-buffer budget | ≤ 100 MB up to n=2²⁰ | excludes input SRS + scalars (a given) |
| Storage buffers / stage | as low as 8 on mobile WebGPU | pack metadata into `vec4<u32>` |
| Target n | 2¹⁰ … 2²⁰ | latency-bound at the small end |

"Algorithm buffers" = the working scratch the pipeline allocates per MSM. The
input SRS (n points) and scalars are not counted against the 100 MB — they are
problem input. This matches the baseline accounting: V2 ≈ 62 MB @2¹⁷ (over
budget at large n), stream-walker ≈ 9 MB @2¹⁷ / 31 MB @2²⁰ (within budget but
~25 % slower than V2).

## 2. First-principles cost model

Windowed Pippenger with signed digits and batch-affine accumulation
(Montgomery's trick) is the right skeleton on every target: it turns the hot
per-add cost from one inversion into ≈ 3 Fq-mults + |I|/m, and the GPU runs the
m independent pairs concurrently. Both baselines already do this; we reuse the
field primitives, batch inversion, planner, transpose (CSR→CSC), bucket
reduction (BPR) and Horner combine unchanged.

With window size `c`, scalar bit length λ, and window count `T = ⌈λ/c⌉`:

| Stage | Work | Scales with |
|---|---|---|
| decompose + transpose-scatter | bucketing of n·T digits | **n·T** |
| transpose-scan (prefix sum) | T · 2ᶜ | **T · 2ᶜ** |
| batch-affine accumulate | ≈ n·T adds (3 Fq-mul each) | **n·T** |
| bucket reduction (BPR) | ≈ 2·T·2^(c-1) adds | **T · 2ᶜ** |
| Horner combine | c·(T−1) dbl + (T−1) add | **T** |

Two terms dominate differently by size: `n·T` (accumulation) grows with n;
`T·2ᶜ` (BPR + scan) is **flat in n**. `MSM_DESIGN_ANALYSIS.md` measures BPR-1 at
**37 % of GPU wall at n=2¹⁶** — the flat term is the mobile/small-n bottleneck.

The memory side scales the same way. Buffers split into:

- **T-scaled**: `bucket_sums` (T·2^(c-1)·64 B), `bucketMeta`, the dense/sorted
  bucket lists, radix histogram — everything indexed by bucket.
- **n-scaled**: per-thread accumulators, walker partials, thread cuts.

## 3. The lever: GLV endomorphism decomposition

BN254 has the order-3 endomorphism `φ(x,y) = (β·x, y)`, acting on the
prime-order subgroup as `φ(P) = [λ]P` with `λ²+λ+1 ≡ 0 (mod r)`,
`β²+β+1 ≡ 0 (mod q)`. Every scalar splits as `k ≡ k₁ + λ·k₂ (mod r)` with
`|k₁|,|k₂| < 2¹²⁷` (Gauss-reduced lattice + Babai rounding; see `cuzk/glv.ts`).
So

```
  Σ kᵢ Pᵢ   ≡   Σ k₁ᵢ Pᵢ  +  Σ k₂ᵢ φ(Pᵢ)
  (n pairs, 254-bit)        (2n pairs, 128-bit)
```

This is the design analysis's #1 unexploited win ("wins everywhere", used by
neither baseline). It is mobile-perfect: `φ` is one Fq-multiply by β plus a free
coordinate copy, identical on TBDR / Adreno / Mali, and adds **zero** workgroup
memory.

**Effect on the cost model.** λ halves (254 → 128), so `T` halves. The total
accumulation work is **unchanged** — `2n·T′ = 2n·⌈128/c⌉ ≈ n·⌈254/c⌉ = n·T`
nonzero digits — but every **T-scaled** term halves:

- BPR and transpose-scan (`T·2ᶜ`) **halve** → the flat, small-n-dominant term.
- Horner (`T`) halves.
- The accumulation term (`n·T`) is flat → no regression on the large-n term.

So GLV is a strict **time** improvement concentrated exactly on the stage that
dominates mobile/small-n latency, with no increase to the n-dominated stage.

## 4. Memory budget under GLV

Because total work is invariant, the accumulator thread count should track
**total adds**, not the raw 2n pair count (a planner that sizes threads off
`runN = 2n` over-allocates). Holding threads at the work-justified baseline, the
T-scaled buffers halve and the n-scaled buffers stay flat. Computed from the
real buffer formulas (`ba_stream_plan.ts`, `BW=⌈(2^(c-1)+1)/256⌉·256`):

| n | variant | c | T | bucket_sums | T-scaled | n-scaled | **algorithm total** |
|---|---|---|---|---|---|---|---|
| 2¹⁷ | baseline 254-bit | 13 | 20 | 5.31 MB | 9.01 MB | 3.52 MB | **12.52 MB** |
| 2¹⁷ | **GLV 128-bit** | 13 | 10 | 2.66 MB | 4.50 MB | 3.52 MB | **8.02 MB** (−36 %) |
| 2²⁰ | baseline 254-bit | 15 | 17 | 17.27 MB | 29.27 MB | 14.06 MB | **43.33 MB** |
| 2²⁰ | **GLV 128-bit** | 15 | 9 | 9.14 MB | 15.50 MB | 14.06 MB | **29.56 MB** (−32 %) |

Both variants sit far under the 100 MB budget; GLV cuts the footprint by ~⅓ and
the memory × time product by roughly **0.66 × 0.55 ≈ 0.36** of baseline on the
T-scaled stages (memory and the flat-time term move together).

**Input SRS.** A host-materialized 2n point set would double the *input* SRS
buffer (not counted in the 100 MB budget, but real GPU memory). The
memory-optimal variant computes `φ(Pᵢ)=(β·xᵢ, yᵢ)` **on the fly in the
point-fetch** (the digit layout already carries a per-entry sign bit; add a
1-bit `φ` flag and apply β to x at read time), keeping point storage at n.

## 5. Per-architecture knobs

| Knob | Apple / Adreno (32 KB) | Mali Bifrost (16 KB) |
|---|---|---|
| TPB | 128 | **64** (forced by `pref_scratch = TPB·S·2·16 B`) |
| S (inversion slots) | 8 | 8 |
| c | `pickC(n)` (≈13 @2¹⁷, 15 @2²⁰); under GLV, re-`pickC` on the doubled count | same |
| `pref_scratch` placement | `var<workgroup>` (32 KB exactly) | must drop TPB to fit 16 KB |

`scalarBits` (new `MsmConfig` knob) selects the window count generically:
`numWindows = ⌈scalarBits/c⌉`. 254 = default; 128 = GLV; it also enables
reduced-bit MSMs (e.g. 32-bit scalars → T≈4, the design analysis's modelled
≈40 ms @2¹⁶).

## 6. Validation status (honest)

This host has **no GPU**. Correctness is validated under SwiftShader (software
rasterizer, `google/swiftshader`, 32 KB workgroup) at small sizes only, against
a noble (CPU bigint) reference — see `dev/msm-webgpu/xcheck.*`.

- **Validated (SwiftShader, logn 8 & 10, vs noble):**
  - existing pipeline: PASS
  - GLV mode (`scalarBits=128`, 2n pairs, on-host split): **PASS** — the
    endomorphism decomposition is correct end-to-end (max `|kᵢ| = 126 bits`).
- **Modelled (no GPU):** the §2/§4 cost and memory tables are derived from the
  real buffer formulas and the published profile breakdown, not measured.
- **Designed, not yet wired:** (a) work-invariant thread allocation so the
  planner sizes threads by total adds rather than `runN=2n` (needed to realize
  the §4 memory win — the current host-materialized path gets the time/window
  win but over-allocates threads); (b) on-the-fly `φ` point-fetch to avoid
  doubling the input SRS.
- **Blocked:** time + peak-GPU-memory numbers on real Apple/Adreno/Mali devices
  require BrowserStack (2 seats shared across ~10 agents); pending queue access.
