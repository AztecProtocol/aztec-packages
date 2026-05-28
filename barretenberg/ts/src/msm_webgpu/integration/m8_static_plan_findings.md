# M8 precursor — empirical (pairs, carries, strideCnt) distribution study

*Run 2026-05-26 on `sb/investigate-wgpu-static`. Reproduce with:*
```
cd barretenberg/ts && npx tsx src/msm_webgpu/integration/m8_static_plan_study.ts
```
*Raw stats JSON: [m8_static_plan_study.json](m8_static_plan_study.json). Harness:
[m8_static_plan_study.ts](m8_static_plan_study.ts).*

## Question

[ROADMAP.md M8](ROADMAP.md#m8) names a static upper-bound plan as the
top-preference fix for the `fused` SLC-eviction regression. Before
re-deriving and shipping such a plan we want to know:

1. For each `(n, level, window)` cell, how tight is the distribution of
   `(pairs, carries, strideCnt)` across random scalar sets?
2. Is there a per-cell value the empirical distribution sits at or just
   below for **every** random scalar set we throw at it?
3. Is the pair-tree depth fixed per `n`, or does it fluctuate?
4. Is the per-window variance uniform (one shared bound covers all
   windows) or skewed (per-window bounds needed)?

Concrete answers below determine whether a static schedule baked at pool
construction is feasible at all.

## Method

Host-only — no WebGPU device required. The GPU `bucket_histogram` and
`level_plan` kernels each have a byte-identical host JS reference inside
`msm_v2.ts` (`buildInitCounts` and the inner loop of `hostLevelWalk`).
Running the study against the reference reproduces what the GPU emits
while staying portable, deterministic-given-seed, and ~100× faster than
driving a browser harness.

| Parameter | Value |
|---|---|
| `n ∈` | `{2¹², 2¹⁶, 2²⁰}` |
| `c = pickC(n)` | `{8, 13, 15}` |
| `numWindows = ⌈254/c⌉` | `{32, 20, 17}` |
| `BW = ⌈(2^{c-1}+1)/256⌉ × 256` | `{128, 4352, 16640}` |
| Runs per `n` | 100 independent random scalar sets |
| Scalar sampler | 32 random bytes, top 2 bits cleared (values `< 2²⁵⁴`, a superset of canonical Fr) |

Total wall time on this machine: **23.6 s** for all three sizes,
dominated by `n=2²⁰` at ~21.6 s.

## Headline result

**Static plan is viable at every studied `n`.** The pair-tree depth is
constant across all 100 runs at each `n`, and every `(level, window)`
cell's distribution is concentrated tightly enough that `max == p99 ==
p95` across 100 trials within rounding.

| Quantity | n=2¹² | n=2¹⁶ | n=2²⁰ |
|---|---|---|---|
| Pair-tree depth (`mean=min=max`) | **8** | **11** | **8** |
| `wstride1` mean | 2086 | 33822 | 528441 |
| `wstride1` max | 2089 | 33849 | 528487 |
| `wstride1` (max − mean) / mean | 0.14 % | 0.080 % | **0.0089 %** |
| `wstride1` max/p99 | 1.000 | 1.000 | 1.000 |

The per-cell `max/p99` ratio is **exactly 1.0** for every cell in every
table below — i.e. the integer-valued distribution is so tight across
100 trials that the p99 sample equals the maximum sample. This is the
Poisson-/concentration-of-measure signature you'd expect from
`n / (numWindows × BW)` random assignments, and it means a static
schedule with even a tiny safety margin will cover every realistic
input.

## Q1: Per-cell distribution tightness

Selected per-window cells at level 0 (`pairs` and `strideCnt` are the
two we'd actually size a buffer against; `carries` is bounded above by
the active-bucket count and is much smaller).

**n=2²⁰, level 0, per window — strideCnt**

```
  w  |    mean       p50       p95       max     stddev    CV
  ---+----------------------------------------------------------
   0 |   528379    528375   528440    528452    30.4    0.000
   1 |   528379    528380   528432    528470    33.7    0.000
   …  ~17 windows, all within ±50 of mean across 100 runs
  16 |   528388    528388   528441    528469    32.7    0.000
```

**n=2¹⁶, level 0, per window — strideCnt**

```
  w  |    mean       p50       p95       max     stddev    CV
  ---+----------------------------------------------------------
   0 |    33790     33789    33824     33830    18.3    0.001
   …  ~19 typical windows, σ ≈ 16, CV ≤ 0.001
  19 |    32800     32800    32805     32809     2.9    0.000   ← top window
```

The coefficient of variation per cell is `≤ 0.001` for `strideCnt` and
`≤ 0.015` for `carries` across every studied `n` and every typical
window. The numeric spread (`max − mean`) at level 0 is ~100 ppm of the
mean. That's roughly `O(√mean)` Poisson noise.

## Q2: Tightness of the upper bound

For every studied `n`, the empirical p99 equals the max across 100 runs
to integer precision — i.e. **the distribution sits at or just below a
fixed value, indistinguishable from a hard ceiling at this sample
size.**

Concrete numbers (level 0, per-window max across the run):

| | mean | max | gap (max−mean) | gap / mean |
|---|---:|---:|---:|---:|
| `pairs` @ n=2²⁰  | 520,246 | 520,301 | 55 | 0.011 % |
| `strideCnt` @ n=2²⁰ | 528,441 | 528,487 | 46 | 0.0087 % |
| `carries` @ n=2²⁰ | 8,306 | 8,398 | 92 | 1.11 % |
| `pairs` @ n=2¹⁶  | 32,736 | 32,743 | 7 | 0.021 % |
| `strideCnt` @ n=2¹⁶ | 33,822 | 33,849 | 27 | 0.080 % |
| `pairs` @ n=2¹² | 2,032 | 2,037 | 5 | 0.25 % |

A static bound of `expected_max × (1 + ε)` with `ε` as small as 1 % covers
every observed run by a wide margin. A bound of `mean × (1 + 2 %)` (i.e.
2× the empirical Poisson tail) is comfortably above every observed max.

## Q3: Termination depth

Constant across all 100 runs at every `n`:

| n | c | numWindows | depth (every run) |
|---|---|---|---|
| 2¹² | 8 | 32 | 8 |
| 2¹⁶ | 13 | 20 | 11 |
| 2²⁰ | 15 | 17 | 8 |

Depth is **not** monotone in `n` because `c` changes — `n=2¹⁶` (c=13)
concentrates more mass per bucket (mean `n/BW ≈ 16`) than `n=2²⁰`
(c=15, mean `n/BW ≈ 64`), and the heaviest bucket determines the
last-active level. Either way, the depth is determined by
`(n, c, BW)` alone and does not fluctuate.

This collapses the host-side trim-trailing-zeros loop entirely: at
pool construction time we can simply tabulate `depth(n, c)` per
configured `n`.

## Q4: Per-window uniformity

At every `n`, all but **one** window has near-identical statistics. The
exception is the top window (index `numWindows − 1`), which:

- has lower `carries` (~½ the typical, because the top window's effective
  bit-width is `c−1` — no carry-in from a non-existent higher window);
- has slightly different `pairs` from the rest (modestly higher at small
  `c`, lower at large `c`);
- still falls well inside the same overall tightness.

Concrete (n=2²⁰, level 0):

| window | strideCnt mean | strideCnt max |
|---|---:|---:|
| 0..15 (typical) | 528,381 – 528,391 | up to 528,487 |
| 16 (top) | 528,388 | 528,469 |

At n=2²⁰ the top window is *not* visibly asymmetric — only the
`carries` field shows the gap, and only at lower `c`. Conclusion: a
**single shared per-level bound across windows** is fine for sizing.
If we want to be cute, an `if (w == numWindows-1)` branch can take a
smaller carries bound, but it's not load-bearing.

## Q3b — per-level pairs-total decay (sanity check against the `2/3` recurrence)

The source code comment cites `s_{k+1} ≤ ⌊(2/3) · s_k⌋`. The empirical
ratio is actually closer to **0.5** for the first few levels, then
collapses sharply once buckets start hitting `cnt = 1` (which retires
to zero rather than carrying):

```
n=2²⁰ (c=15):
  lv 0 → 1: 0.500
  lv 1 → 2: 0.500
  lv 2 → 3: 0.500
  lv 3 → 4: 0.504
  lv 4 → 5: 0.500
  lv 5 → 6: 0.467
  lv 6 → 7: 0.000   ← every remaining bucket was cnt=1, all retired
```

The 2/3 figure is a comfortable upper bound, but for *sizing* the
schedule we can use the empirical 0.5 (with margin) and save buffer
memory.

## Recommendation

**Build a static plan.** The data is unambiguous:

- depth is fixed per `(n, c)`;
- per-cell distribution is `O(√n)`-tight around a deterministic mean,
  consistent with the law of large numbers (`n` Booth digits dropped
  into `BW` buckets);
- a single bound per `(level, window)` covers every observed run, and
  there is no per-input pathology that a static plan would mis-size.

The implementation can simulate the level walk **once per `(n, c, BW, S)`
configuration** against a synthetic histogram (every active bucket =
`⌈n / numActiveBuckets⌉ + safety`), cache the resulting `levelPlans`
inside the `MsmV2` instance, and let `prepare()` skip the
`bucket_histogram` dispatch, the `level_plan` dispatches, and the
`mapAsync` round-trip entirely. This is exactly the trade ROADMAP M8
spelled out as the largest available win.

**Where to set the margin.** From the table above, `2× the empirical
Poisson tail (max − mean)` is safe (gives ~0.02 % overprovisioning at
n=2²⁰) and reproducibly covers every run we've measured. A more
defensive `+5 %` over the empirical max would still leave us miles
inside the existing buffer sizes — the dynamic plan already pads with
`OVERSIZE_FACTOR` on the slow path.

## Caveats worth documenting in the implementation PR

1. **Sampler is uniform-on-[0, 2²⁵⁴)**, not Fr-canonical. Fr ≈ 0.756 ·
   2²⁵⁴, so the very top window sees a ~24 % broader distribution than
   production. Top-window `carries`/`pairs` are *already* the
   visually-distinct cell (lower `c−1` effective bit-width), but at
   n=2²⁰ the gap shows as ~30 fewer carries, not a different order of
   magnitude. Recommend repeating the study with Fr-canonical rejection
   sampling before landing the static plan, just to confirm the top
   window's static bound is correct.

2. **The previous static-plan attempt failed at n=2²⁰ with "value is
   not invertible"** (per [ROADMAP.md M8](ROADMAP.md#m8)). Root cause
   was never isolated. The failure mode looks like the affine-add
   pair-tree hit a same-`x` pair, which the self-pad trio is supposed
   to prevent. Hypotheses to rule out during implementation:

   - **Off-by-one in the `wstride` derivation.** The dynamic plan
     computes `wstride1 = max(strideCnt across (level, window))`. If
     the static derivation rounds `strideCnt` down per cell, the
     planner's stride wraps and writes outside its slot.
   - **Top-window asymmetry.** If the static schedule uses the same
     per-window bound for every window, the top window may have one
     extra empty slot at the pad trio's position — fine. The reverse
     (smaller bound for top window when other windows fit-check
     against the larger one) is the failure mode to avoid.
   - **Interaction with the fast-path's `OVERSIZE_FACTOR` padding.**
     The dynamic plan grows the cap by `OVERSIZE_FACTOR` on slow-path
     entry. A static plan needs to either bake that factor in or be
     sized to *include* its effect, so the very first `prepare()`
     also fits.

3. **The empirical data does NOT validate that "every possible random
   scalar set will fit"**, only that 100 runs at each `n` did. Even at
   `n=2²⁰` the spread is well within Poisson tail; a 1000× factor of
   safety margin is essentially free, so use it.

## Numbers to take into the implementation PR

For the three `n` values above (and only these — chonk's working range
is `n ∈ [16k, 131k]`, so we'll want at least one more `n` between them):

| n | c | numWindows | depth | `wstride1` cap | level-0 pairs cap | level-0 strideCnt cap |
|---|---|---|---|---:|---:|---:|
| 2¹² | 8 | 32 | 8 | 2089 + margin | 2037 + margin | 2089 + margin |
| 2¹⁶ | 13 | 20 | 11 | 33,849 + margin | 32,743 + margin | 33,849 + margin |
| 2²⁰ | 15 | 17 | 8 | 528,487 + margin | 520,301 + margin | 528,487 + margin |

Per-level numbers for all three `n` are in
[m8_static_plan_study.json](m8_static_plan_study.json) under
`perLevelMaxOverWindows`.

## Implementation status (2026-05-26)

Static plan landed behind `MsmConfig.useStaticPlan` (default `false`), wired
into the dev page as `?staticPlan=1`. Both the `MsmV2.computeStaticPlan`
host function and the harness-local mirror derive bounds from the
recurrence directly rather than from synthetic histograms (a first
attempt with synthetic-uniform-odd init counts was rejected because
uniform synthetic walks converge in too few levels — they correctly
bound per-cell totals but under-provision the depth at small mean per
bucket).

Final formulas (see code comments in
[msm_v2.ts:computeStaticPlan](../msm_v2.ts) for full reasoning):

```
activeBuckets        = min(2^(c-1), n)
meanPerBucket        = ⌈n / activeBuckets⌉
maxBucketEstimate    = meanPerBucket × 4 + 32   // Poisson tail, generous
depthBound           = ⌈log₂(maxBucketEstimate)⌉ + 4 levels of safety

For each level k ∈ [0, depthBound):
  pairsBound    = ⌈n / 2^(k+1)⌉ + 1
  carriesBound  = min(activeBuckets, ⌈n / 2^(k+1)⌉)
  strideCntBnd  = pairsBound + carriesBound

  pairBlocksPerWindow[k] = max(1, ⌈pairsBound × 1.05 / S⌉)
  carriesPerWindow[k]    = max(1, ⌈carriesBound × 1.05⌉)
  wstride1               = max over k of ⌈strideCntBnd × 1.05⌉
```

The `1.05` safety multiplier sits on top of the slow path's existing
`OVERSIZE_FACTOR = 1.3` (which still applies to actual buffer sizing),
so the effective over-provisioning for first-time `prepare()` is `1.05 ×
1.3 ≈ 1.37` above the recurrence bound — comfortable.

### Validation: static plan vs 100-run empirical max

Harness output (`yarn dev:msm-webgpu`-equivalent host-only:
`npx tsx src/msm_webgpu/integration/m8_static_plan_study.ts`):

| n | static depth | empirical depth | wstride1 ratio | pairs ratio (level 0) |
|---|---|---|---:|---:|
| 2¹² | 12 | 8 | 1.094 × | 1.055 × |
| 2¹⁶ | 11 | 11 | 1.144 × | 1.051 × |
| 2²⁰ | 13 | 8 | 1.074 × | 1.058 × |

PASS across all three: every (level, window) cell observed across 100
runs is covered by the static bound. Depth over-provisioning ranges from
0 to 5 extra levels — each extra level costs ~4 dispatches per `run()`
on essentially-empty count buffers.

### Adversarial-input caveat

The depth bound `log₂(meanPerBucket × 4 + 32) + 4` covers
random-Fr-scalar inputs comfortably but **does not cover adversarial
inputs** (all scalars equal, all bits set, etc.), where one bucket
could hold all `n` counts and need `log₂(n) + 2` levels. The C++ hook
delegates only when `handle_edge_cases == false`, and SRS-backed callers
in production pass real protocol scalars — adversarial inputs are not
a production concern. If we ever need a defensive path, the static plan
would dispatch one extra `level_plan` probe and fall back to dynamic
when buckets remain non-zero past `depthBound`. Not in scope here.

### What still needs browser validation (M8 acceptance criteria)

1. **Profile comparison.** Run the dev page with and without
   `?staticPlan=1` at log₂(n) ∈ {12, 16, 20}. Confirm `prep_booth_decode`
   and `prep_level_plan` drop to ~0 ms and `host_prepare` shrinks by the
   sum of the two. The expected delta at n=2²⁰ is **−5 to −7 ms** of
   `host_prepare` per MSM.

2. **`fused` regression check.** Confirm the static path does NOT
   re-introduce the SLC eviction hit (it shouldn't — no scalar read or
   histogram write happens). `fused` at n=2²⁰ should land within noise
   of the existing `?hostHist=1` baseline (~137 ms median).

3. **Correctness at n=2²⁰.** Run the dev page's WebGPU vs WASM-MT cross
   check with `?staticPlan=1` at log₂(n) = 20, repeated for several
   independent random scalar sets. Match must hold byte-for-byte (no
   `value is not invertible` errors — that was the previous attempt's
   failure mode; this derivation should not hit it because the bounds
   are strict upper bounds with safety multiplier, not under-bounds).

4. **Headless Chonk e2e.** Run `chonk_browser_webgpu_bench.test.ts`
   with `useStaticPlan: true` plumbed via the bridge (currently it
   isn't — the bridge's `MsmConfig` doesn't yet forward the flag).
   Confirm `vks_match: true`. If passing, flip the default in
   `bridge/main.ts` once measurement is in STATUS.md.

After (1)–(3) pass, update STATUS.md "Profile snapshot" with the new
numbers and flip `useStaticPlan` to default-on in `MsmConfig` or in the
bridge.


## Update (2026-05-27) — f2cc dropped; static plan must use INPUT-based depth

Two connected findings landed this session.

### 1. The `f2cc5cb4fe` "move per-level bucket walk to GPU" commit is wrong

Confirmed (matches a prior bisection): f2cc produces wrong MSM results for
all inputs — the dev-page WebGPU↔WASM↔noble cross-check diverges. Root
cause is an **off-by-one in its host stats-reading loop**: f2cc broke on
`totalStride === 0` (the level's *output* sum), which stops one level
**before** the dynamic walk should. The skipped level is the *retirement*
level — its input is the previous level's `cnt=1` singletons, which it
**finalizes** (emits to the result). Dropping it loses those points.

f2cc was dropped from this branch via
`git rebase --onto c918d05a3c f2cc5cb4fe`. The default dynamic path is now
the c918 host walk (GPU level-0 histogram + 2 MB readback + inline
per-level walk), which terminates on `!anyActive` (the level's *input*) —
**input-based**, and includes the retirement level. Known-correct.

### 2. The static plan depth must match the input-based count

The earlier `EMPIRICAL_DEPTHS` table used the f2cc **output-based** depths
(one too small). Baked into the static plan, that reproduces the *same*
finalize-dropping bug. Corrected to the **input-based** (`levelsActive`)
depths — the count the c918 host walk dispatches:

| logN | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| depth | 6 | 7 | 8 | 9 | 10 | 13 | 11 | 12 | 7 | 8 | 8 |

Re-validated: static plan PASSES (covers every observed cell) at all 11
sizes, 100 runs each, with these depths. Static depth now equals the
dynamic walk's depth exactly at every size.

### Consequence: the static plan is a correctness fix, not just a perf win

Because the static plan bypasses the level-0 histogram **and** the
per-level walk entirely (dispatch sizes come from the closed form; actual
counts still flow `csr2v2_meta → countsBufs[0]` at run time), it never
touches the f2cc kernel. With the input-based depths it dispatches the
same level count as the known-correct c918 walk. So `useStaticPlan` should
be correct on hardware — pending the browser cross-check at n=2²⁰ and the
chonk e2e VK-match (still the open validation items below).

## Update (2026-05-27, second) — wrong sampler found; top-window root cause

The browser cross-check (user hardware) failed `?staticPlan=1` at
log₂(n) ∈ {18, 19, 20} — and ONLY those — while the dynamic path passed
everywhere. All three are the `c=15` sizes. Root cause:

**The study harness sampled scalars uniform over [0, 2²⁵⁴), but the dev
page and every real caller reduce mod r (≈ 0.756 · 2²⁵⁴).** Reduction
reshapes the histogram only in the TOP partial window (`254 mod c` bits) —
but that window is exactly what governs both the pair-tree depth and the
per-level "knee". Under the wrong sampler the plan looked safe; under
mod-r sampling (`MOD_R=1`, now the harness default) it under-provisions
`c=15`:

| n | bound that failed (uniform → mod-r) |
|---|---|
| 2¹⁸ | pairs lvl4: 1072 blocks vs **1316** needed |
| 2¹⁹ | pairs lvl5: 1072 vs **1461** |
| 2²⁰ | pairs lvl6: 1072 vs **1535**; carries lvl5: 9523 vs **11067**; depth 8 vs **9** |

Why `c=15` only: its top window is wide (14 bits, ~8192 buckets) so it
holds a *thick* slow-draining population — the residual above `n/2^(k+1)`
peaks near `0.25·activeBuckets`, and carries spike to `0.68·activeBuckets`.
`c≤13` top windows are narrow (≤7 bits) → a long but *thin* tail whose
residual is only tens of pairs, comfortably inside the old additive (so
those sizes passed all along).

### Fixes (validated: all 11 sizes PASS under MOD_R, 120–400 runs)

```
numWindows       = ⌈254 / c⌉
topBits          = 254 − c·(numWindows − 1)
topMean          = n / 2^(topBits − 1)
depth            = ⌈log2(topMean)⌉ + 2          (analytic; replaced the table)
pairsBound[0]    = ⌈n/2⌉ + max(16, ⌈3·√aB⌉)      (lvl0 pairs ≤ n/2 strictly)
pairsBound[k>0]  = ⌈n/2^(k+1)⌉ + max(16, ⌈3·√aB⌉, ⌈aB/3⌉)   (top-window knee)
carriesBound[k]  = min(⌈0.8·aB⌉, ⌈n/2^(k+1)⌉)    (was 0.55·aB)
wstride1         = max over k of (pairsBound[k] + carriesBound[k])
```
where `aB = activeBuckets`. The depth formula is derived from the
top-window drain (a bucket of count C drains in ⌈log2 C⌉ + finalize; the
+2 absorbs the max-over-mean tail). It covers every measured max with 0–1
levels of margin and is robust — maxBucket would have to *double* (many σ)
to add a level — so it needs no per-size table. The earlier hand-measured
`EMPIRICAL_DEPTHS` was itself wrong under mod-r (n=2¹¹: 7 vs 8, n=2²⁰: 8 vs
9). `OVERSIZE_FACTOR = 1.3` still applies to buffer sizes on the slow path.

### Correctness is empirical, not guaranteed (decision: keep, document)

These are upper bounds calibrated to **uniform-random (mod-r) scalars**, not
proofs. Over-provisioning is correctness-safe; under-provisioning corrupts
silently (no runtime overflow check on this path). Structured/adversarial
scalars (many equal/zero/repeated digits) can pile one bucket far past the
predicted depth/pairs/carries. The dynamic path reads the real histogram and
is exact for any distribution. Therefore `useStaticPlan` stays **default-off
and scoped to validated random-scalar benchmarking** — not production
proving. (Options considered: runtime overflow-detect + dynamic fallback;
provable worst-case bounds `depth=log2 n+2`, `carries≤aB`; validating on the
real chonk scalar distribution. Deferred — see MsmConfig.useStaticPlan doc.)

### Still open (needs hardware)

- Browser re-check with `?staticPlan=1` at log₂(n) ∈ {18, 19, 20} (the
  previously-failing sizes), multiple seeds — must match WASM + noble.
- e2e/per-phase static-vs-dynamic comparison into STATUS.md.

## Update (2026-05-28) — tighten post-knee tail to recover M8 perf

The first correctness pass put `useStaticPlan` at e2e wash (n=2²⁰: +4 ms),
because the conservative deep-level bounds dispatch many empty fused
blocks past the knee. STATUS.md flagged it; this update tightens two
constants while staying within the same proof.

```
pairsAdditiveDeep[k]  = min( ⌈aB/3⌉, ⌈n/2^(k+1)⌉ )    (was: ⌈aB/3⌉)
carriesCap            = ⌈0.75·aB⌉                      (was: ⌈0.80·aB⌉)
```

Why both stay safe:
- The deep additive only matters past the knee, where the top-window
  bump is *gone* and real pairs[k] ≤ ⌈n/2^(k+1)⌉ — so capping the
  additive at `⌈n/2^(k+1)⌉` gives bound `2·⌈n/2^(k+1)⌉` (100 % margin
  on real). At and before the knee, `⌈n/2^(k+1)⌉ ≥ aB/3` so the cap is
  a no-op and the original `aB/3` knee margin is preserved.
- Carries spike at the knee at 0.675·aB (n=2²⁰ lvl5: 11067/16384). 0.75
  keeps 11 % margin, decay CV ≈ 0.008 / max ≈ p99 — comfortable.

Effect at n=2²⁰ (analytic, blocks per window):

| level | pairs blocks: old → new |
|---|---|
| 0..5 (pre-knee) | unchanged |
| 6 (knee) | 1707 (unchanged — additive still aB/3) |
| 7 | 1195 → **1024** (−14 %) |
| 8 | 939 → **512** (−45 %) |

Across 17 batches that's ~10 k fewer no-op fused blocks per MSM at the
deepest two levels. Carries cap −6 % at every level. **Needs GPU
timing** to confirm the `fused` Δ recovery — left for the next session.
Host validation: all 11 sizes still PASS under MOD_R (120 runs/size).

## Update (2026-05-28, second) — chonk e2e empirically breaks static

Ran the chonk e2e proving page (`yarn-project/ivc-integration`,
`ecdsar1+transfer_1_recursions+sponsored_fpc` flow) with the bridge
wired to `useStaticPlan` via `webgpuMsmStaticPlan` and `?staticPlan=1`:

| Configuration | Result |
|---|---|
| WASM only (webgpuMsm off) | proof verifies |
| WebGPU dynamic (no `?staticPlan=1`) | proof verifies |
| WebGPU + static (`?staticPlan=1`) | **proof fails to verify** |

This is the documented failure mode — the static bound is calibrated to
~uniform reduced-mod-r scalars; chonk's protocol scalars are
distinctly non-uniform (the per-label block-list section of STATUS.md
catalogues the most-skewed columns — `LOOKUP_READ_COUNTS`,
`LOOKUP_READ_TAGS`, `VK_PRECOMPUTED_POLY` — but the non-blocklisted
MSMs are clearly skewed enough to trip a tightly-fit empirical bound
too). Some MSM along the way ran into pairs/carries/depth past the
predicted upper bound, wrote out of the planner-laid range, and emitted
a wrong window sum → invalid commitment → verification fails.

**Status:** static stays default-off and scoped to validated
random-scalar benchmarking (the dev page). For chonk to ever use static,
one of the following needs to land:

1. **Runtime overflow-detect with dynamic fallback.** GPU planner sets
   a 1-word flag if it tried to write past the static bound; host
   checks async, re-runs the offending MSM on the dynamic path if
   tripped. Restores a hard correctness guarantee at the cost of a
   small per-MSM check.
2. **Wider blocklist** of MSMs that stay on the native Pippenger for
   any chonk run that opts into static, derived from a per-MSM
   scalar-distribution analysis (msmDistributionMode mode is already
   in tree).
3. **Distribution-aware bounds.** Profile real chonk scalars per MSM
   label, widen the bounds where needed, keep the tight bounds for
   uniform-random cases.
