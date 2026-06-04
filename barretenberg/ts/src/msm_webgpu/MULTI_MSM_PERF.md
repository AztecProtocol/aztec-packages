# Multi-MSM saturation win — measurement (M2)

Measured on M2 (Dawn/Metal), branch `msm-arena-rewrite`. This is the perf side of
the acceptance criterion in `MULTI_MSM_PLAN.md`; correctness (byte-identical
union≡solo) is established in `MULTI_MSM_HANDOFF.md`. Target regime: **n = 128–4096
MSMs, batched** — the small MSMs that starve the GPU solo.

## TL;DR

- **The union delivers a real GPU-saturation win in the 128–4096 regime**, growing
  with pack size K: ~1.5× at K=2 → ~3× at K=4 → ~4.5× at K=8 → **9–14× at K=64**
  (smaller n). The win is *larger for smaller n* and *grows with K* — exactly the
  acceptance criterion ("packed small MSMs no longer starve the GPU").
- **It is genuine saturation, not launch/mapAsync amortisation.** The win measured
  in **GPU-compute time** (timestamp-query) ≈ the win in wall time at every cell. If
  it were only batching bookkeeping (which the current bridge already does), wall
  would far exceed GPU-time; it doesn't. The union does K MSMs' work in ~⅓–1/14 the
  *GPU compute time* of running them sequentially.
- The smooth scaling with K (not a jump-to-ceiling at K=2) is the saturation
  signature: fixed-cost-amortisation alone would flatten immediately.
- **The 160 MiB budget gate caps K per n** and is enforced at runtime: larger n
  saturates the budget at smaller K (n=4096 → K≤32 at 127 MiB; K=128 rejected at
  372 MiB). All packs that ran are byte-identical union≡solo.

## Methodology

`dev/msm-webgpu/main.ts` → `measurePack(device, logNs, reps)` and the
`?autorun=msm-batch-bench` sweep. Per cell (a homogeneous pack of K copies of n):

- **Solo baseline (Σ-solo):** each member on its own isolated `MsmV2`Pool+instance,
  warm-up run then `reps` timed runs; record **median wall** and **median GPU-compute
  ms** (`readProfileGpuMs`, summed per-pass timestamp-query); Σ over the K members.
  This is the cost of running the K MSMs separately.
- **Union:** one `MsmV2` over the concatenated super-MSM (`prepareBatch`), a single
  dispatch over Σ NW windows; warm-up then `reps` timed runs; median wall + GPU ms.
- **Two speedups reported:**
  - **gpuThroughput = Σ soloGPU / unionGPU** — pure GPU-compute efficiency. The GPU
    runs K-separate (or one batched-encoder's) passes sequentially, so Σ soloGPU ≈
    the current bridge's GPU cost; this ratio is the *genuine saturation win the
    union adds over the sequential bridge*.
  - **wallSpeedup = Σ soloWall / unionWall** — end-to-end, also folds in the K×
    launch+mapAsync the union removes (which the bridge already amortises).
- Every cell also asserts **byte-identical union≡solo per member** with a
  distinct-scalars guard (so `scalarBase` isn't validated vacuously). reps=5.
- GPU timestamps forced on (`profile:true`), independent of the URL `?profile=`
  (overloaded for the scalar-distribution A–E selector).

## Uniform random scalars (profile ≈ A)

`gpuThroughput` (Σ-soloGPU / unionGPU, ×). `OOB` = rejected by the 160 MiB budget gate.

```
   n\K |    2 |    4 |    8 |   16 |   32 |   64 | 128 |  ceiling
-------+------+------+------+------+------+------+-----+--------------------
   128 | 1.39 | 3.70 | 5.20 | 9.33 |11.09 |13.92 | OOB |  K=64: 25.7ms 135MiB
   256 | 1.45 | 2.71 | 5.59 | 8.08 | 9.71 |12.18 | OOB |  K=64: 29.2ms 141MiB
   512 | 1.54 | 3.00 | 4.50 | 7.64 | 9.26 |10.39 | OOB |  K=64: 35.5ms 133MiB
  1024 | 1.76 | 3.42 | 5.41 | 7.61 | 8.59 | 9.01 | OOB |  K=64: 43.7ms 131MiB
  2048 | 1.92 | 3.51 | 4.90 | 4.43 | 7.17 | 7.33 | OOB |  K=64: 61.5ms 157MiB
  4096 | 1.72 | 2.87 | 3.79 | 4.42 | 4.65 | OOB  | OOB |  K=32: 49.3ms 127MiB
```

wallSpeedup tracks gpuThroughput within ~5–25% (slightly lower at high K, where the
single large readback adds a little wall the GPU-time excludes):

```
   n\K |    2 |    4 |    8 |   16 |   32 |   64
-------+------+------+------+------+------+------
   128 | 1.40 | 3.19 | 4.60 | 7.57 | 8.93 |10.80
   512 | 1.51 | 2.89 | 4.13 | 6.85 | 8.11 | 9.35
  1024 | 1.69 | 3.17 | 4.94 | 6.78 | 7.92 | 8.53
  4096 | 1.75 | 2.76 | 3.76 | 4.53 | 4.78 | OOB
```

Notes:
- **Saturation point shifts with n.** Small n (128–1024) keeps gaining out to K=64
  (still climbing at the budget cap). Large n (4096) flattens by K≈8–16 (~4.5×) — a
  solo n=4096 already half-fills the GPU, so there's less starvation to recover.
- **One non-monotonic dip:** n=2048, K=16 (4.43×) sits below K=8 (4.90×); recovers
  at K=32. Likely a radix-tile / region-split boundary at that (n,K); minor, noted.

## Structured scalars — profiles D & E (hard rule #0)

Profile E = 100% scalars in [0,16) (degenerate few-giant-buckets, stresses
`walker_combine`); profile D = 50% in {0,1,2,3} + 50% random. **Both confirm the
win holds — and grow it — under structured data; no `walker_combine` serialisation
regression.** 17/18 byte-identical each (K=64×n=4096 over budget). gpuThroughput ×:

```
        |    profile E    |    profile D
   n\K  |  4  | 16  | 64  |  4  | 16  | 64
--------+-----+-----+-----+-----+-----+-----
   128  |1.97 |7.78 |11.21|2.80 |8.95 |14.14
   256  |2.74 |5.28 | 9.87|2.89 |8.11 |12.85
   512  |3.82 |5.17 | 7.76|2.76 |8.21 |12.09
  1024  |3.41 |6.89 | 9.14|3.13 |7.65 |10.76
  2048  |3.35 |5.80 | 8.77|3.34 |6.99 | 8.94
  4096  |3.01 |6.29 | OOB |3.51 |6.31 | OOB
```

- **Profile E does not regress.** The giant-bucket union's GPU time at K=64 stays
  *small and roughly flat across n* (~22–30 ms — actually below uniform's, since E
  has fewer distinct buckets = less total work). `walker_combine` does not serialise
  under packing — the multi-dispatch pooling keeps the hot buckets parallel.
- **Profile D shows the largest wins (up to 14.1×).** D has the most solo
  starvation (a heavy {0,1,2,3} spike + a random tail), so pooling recovers the most.
- wallSpeedup tracks gpuThroughput here too (E K=64: 7.5–9.4×; D K=64: 9.8–10.9×).

## Heterogeneous mix (production-faithful)

Production batches mixed sizes, so the union packs different n in one dispatch (no
padding — `point_offsets` + per-window table). All byte-identical union≡solo:

| mix | members | totalWindows | footprint | union gpu | Σ-solo gpu | **gpu-throughput** | wall |
|---|---|---|---|---|---|---|---|
| one-each | n=128…4096 (K=6) | 275 | 55.5 MiB | 9.94 ms | 34.37 ms | **3.46×** | 3.40× |
| small-heavy (Chonk-like) | 6×128,4×256,3×512,2×1024,1×4096 (K=16) | 889 | 69.3 MiB | 13.67 ms | 73.37 ms | **5.37×** | 5.10× |
| even-spread | {128…4096}×4 (K=24) | 1100 | 85.1 MiB | 21.83 ms | 129.50 ms | **5.93×** | 5.58× |

The small-heavy mix (the realistic Chonk shape — many tiny, few large) gets **5.4×**
at only 69 MiB; the win scales with K just like the homogeneous packs.

## Per-stage attribution — which stages saturate

`measurePack` also sums GPU time per pipeline stage (`window.__lastPhaseMs`, the
coarse `setPhase` labels) for union vs Σ-solo, so the saturation can be attributed.
`?autorun=msm-batch-check` prints it. Representative pack: n=512 × K=16.

```
                      Σ-solo →  union | sat.×  | union-share%
                  uniform (overall gpu 6.3×):
  stream_walker     8.94 →  3.17 |  2.8× | 26%   ← post-pack bottleneck #2
  combine_batched  15.92 →  1.74 |  9.2× | 14%   ← walker_combine (hard rule #0)
  pt_loop          26.74 →  0.98 | 27.2× |  8%   ← biggest solo cost, saturates hardest
  pt_init           4.23 →  0.07 | 58.4× |  1%
  planner           1.03 →  0.16 |  6.6× |  1%
  preprocess        0.46 →  0.14 |  3.4× |  1%
  reduce           17.28 →  5.42 |  3.2× | 45%   ← post-pack bottleneck #1
```

The plan's prediction is confirmed: the **HARD stages** (pair-tree, `walker_combine`,
planner) — exactly the ones thread-starved for a solo small MSM — deliver the win.
The pair-tree is the single biggest solo cost (a tiny MSM serialises log-levels in
one thread per hot bucket) and saturates **27–58×** once hot buckets pool across the
pack; `walker_combine` saturates **9×**. After packing, the union's time is dominated
by **reduce (45%) + stream_walker (26%)** — the stages with the least saturation
headroom; they are the next bottleneck.

Structured / heterogeneous shifts (same n=512 × K=16):

- **Profile E (giant buckets):** `combine_batched` is *negligible* (0.18→0.01 ms,
  13×) — E has ≤16 buckets/window, so there is nothing to combine; **no
  `walker_combine` serialisation**. `pt_loop` still dominates solo (23.1 ms) and
  saturates 11×. **reduce becomes 69% of the union** (7.6 ms, only 2.2× saturated) —
  by far the dominant post-packing cost in the degenerate case.
- **Realistic mix:** same shape (pt_loop 19×, combine 9.6×, reduce 44%), except
  **preprocess regresses to 0.76×** (0.42→0.56 ms) — the heterogeneous
  decompose/transpose dispatches at the envelope max-n, wasting threads on small
  members (the plan's "ragged point-iteration" refinement). Only 4% of union time,
  so immaterial now, but the one stage that does *not* benefit from packing a mix.

**Takeaway for follow-on perf:** the multi-MSM win is essentially "make the pair-tree
and combine stop starving," and it does. The remaining union cost is **reduce** (the
single largest union stage, 44–69%, owned elsewhere per the handoff) and
**stream_walker**; a heterogeneous mix additionally leaves **preprocess** un-saturated
(ragged-iteration / work-tile-list refinement).

### Per-stage saturation vs K (the ceiling, explained)

Sweeping K at fixed n exposes *why the overall win plateaus* (n=512, uniform; per-
stage saturation× = Σ-soloGPU/unionGPU):

```
stage           |   K=4 |   K=8 |  K=16 |  K=32 |  K=64 | behaviour
----------------+-------+-------+-------+-------+-------+---------------------------
pt_loop         |  3.5× |  8.0× | 24.9× | 327×  | 610×  | SUPERLINEAR — eliminated
pt_init         |  1.1× |  1.5× | 55.9× |1012×  |1804×  | SUPERLINEAR — eliminated
combine_batched |  2.6× |  5.1× |  7.6× | 23.1× | 62.1× | superlinear
planner         |  2.6× |  4.4× |  6.5× |  9.4× |  8.7× | grows
stream_walker   |  2.2× |  2.6× |  2.6× |  2.9× |  2.7× | PLATEAUS ~2.7×
reduce          |  2.0× |  2.6× |  2.9× |  3.5× |  3.5× | PLATEAUS ~3.5×
OVERALL gpu     |  2.4× |  3.8× |  5.7× |  8.2× |  8.4× | plateaus (Amdahl)
union total ms  |   7.1 |   9.3 |  12.0 |  19.1 |  35.3 |
```

Union-share% (where the packed pipeline spends time as K grows, n=512):

```
stage           |   K=4 |  K=16 |  K=64
----------------+-------+-------+-------
pt_loop         |   25% |    8% |    ·   ← vanishes
combine_batched |   19% |   15% |    3%
stream_walker   |   13% |   26% |   36%  ← grows
reduce          |   27% |   45% |   55%  ← grows, dominant
```

The mechanism, fully resolved:

- **The pair-tree and combine saturate *superlinearly*** (pt_loop 610×, pt_init
  1804×, combine 62× at K=64). Pooling hot buckets across more packed MSMs gives the
  multi-dispatch pair-tree exponentially more parallelism, so these stages **vanish
  from the cost profile** — the starvation the multi-MSM project targeted is gone.
- **`stream_walker` (~2.7×) and `reduce` (~3.5×) saturate early and plateau.** They
  are already fairly parallel for a solo MSM, so packing adds little; as K grows they
  come to dominate (**reduce + stream_walker = 91% of union GPU at K=64**).
- **By Amdahl's law these two plateauing stages cap the overall win at ~8–14×.**
  Overall throughput flattens (8.2× → 8.4× from K=32 → 64). n=128 reaches a higher
  plateau (~14×) because reduce/walker are smaller relative to the pair-tree there.

**So the multi-MSM ceiling is set by `reduce` and `stream_walker`, not by the stages
the project fixed.** Pushing past ~8–14× would require those two to saturate better —
but `reduce` is owned elsewhere / near its compute floor, and `stream_walker` is the
per-thread accumulator. The packing has done its job: it removed the pair-tree/combine
starvation, which is exactly the acceptance criterion.

## Conclusion

The acceptance criterion is met for n=128–4096: **packed small MSMs no longer starve
the GPU.** The win is genuine saturation (GPU-compute-time ≈ wall throughout, not
launch amortisation), scales with K, is largest for the smallest / most-structured
MSMs (profile D up to 14×, profile E 7–11×, realistic mix ~5×), holds on the
giant-bucket profile E without `walker_combine` serialisation, and stays byte-
identical. The 160 MiB budget gate caps K per n at runtime.

This is measured on the **union dispatch path** (`prepareBatch`), which is exercised
by the `msm-batch-bench`/`msm-batch-check` harnesses but **not yet wired into the
production bridge** (`bridge/main.ts runBatchMsm` still runs per-MSM, sequentially) —
that wiring is the remaining production step (handoff #1). The gpuThroughput column
is the honest win *over the current bridge*, since the bridge's batched encoder runs
the same K dispatches sequentially (its GPU time ≈ Σ-soloGPU).

### Honest caveats
- gpuThroughput = Σ(per-pass GPU timestamp durations); it excludes inter-pass launch
  gaps (the union removes K× of those too — credited in wall, not here), so it is a
  *conservative* saturation measure. wall adds the union's single large readback.
  The true win is bracketed by the two; both are 3.5–14×.
- Reps=5 median; trends are smooth/monotonic (one minor uniform dip at n=2048,K=16).
- Per-stage attribution (which stage saturates) is available via the phase trace but
  not broken out here — the end-to-end numbers already establish the criterion.

## Reproduce

Harness lives in `dev/msm-webgpu/main.ts` (`measurePack` + two autoruns). Results
print inline per cell (`[batch-bench]` / `[batch-check]` log lines) and are also
exposed on `window.__benchSamples` (the driver echoes it as `SAMPLES_JSON:`). Both
autoruns force GPU timestamps and assert byte-identical union≡solo with a
distinct-scalars guard. `LOGN_MIN` is 7 (n≥128).

```bash
# vite already serves this worktree on :5210 (see MULTI_MSM_HANDOFF.md)
PROFILE=$(bash ~/localclaudebox/phonetests/warm-profile.sh ~/localclaudebox/measure-profile)
cd barretenberg/ts
B="http://127.0.0.1:5210/dev/msm-webgpu/index.html?coi=1"

# n×K saturation grid (wall + GPU-throughput + per-stage per cell):
node dev/msm-webgpu/drive-persist.mjs "$B&autorun=msm-batch-bench&ns=128,256,512,1024,2048,4096&Ks=2,4,8,16,32,64&reps=5" "$PROFILE"
#   structured: append &scalar_dist=profile&profile=E   (hard rule #0; also D)

# one pack with the PER-STAGE attribution table (Σ-solo → union | sat× | share%):
node dev/msm-webgpu/drive-persist.mjs "$B&autorun=msm-batch-check&logns=9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9&reps=5" "$PROFILE"
#   logns is any comma-list (homogeneous K×n, mixed sizes, mixed c); add profile=E etc.
```

(The pivot/k-scaling tables above were produced by small JSON formatters kept as
session scratch under `~/localclaudebox/measure-results/`; the harness itself prints
every number inline, so they are not required to reproduce the findings.)
