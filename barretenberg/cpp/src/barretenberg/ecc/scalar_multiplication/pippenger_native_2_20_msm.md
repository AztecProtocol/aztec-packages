# Pippenger native 2^20 MSM

## Scope

This note is only about the native single-MSM behavior at `n = 2^20`. It does not try to
optimize for V8, browser WASM, or low-thread browser behavior.

The issue: the round-parallel rewrite is normally faster than legacy Pippenger, but at
`n = 2^20` on native it reaches parity or loses depending on thread count.

> **RESOLVED — it's the window-size cost model, not a backend problem. See "RESOLUTION" at the
> bottom.** The earlier "forcing wider c doesn't help" result (which drove the sparse/tiling
> candidates A–E below) was a bad measurement (5 iters, noisy). Clean 10× sweeps on both builds and
> all HC show **wider c (16–17) is 13–23% faster than the model's c=13 at every size 2^17–2^21**.
> Root cause: `BUCKET_ACC_COST = 15` (legacy uses 5) over-penalizes buckets and under-sizes c by
> ~3. Fix = recalibrate to **3** (one constant; only changes the MSM's internal schedule, not the
> result, so no VK impact). Candidates A–E (sparse/hybrid/tiled buckets) are **not needed**.

## Native totals

Same `pippenger_bench` scaling benches:

- `PippengerRoundParallelScaling` = round-parallel rewrite (`fast`)
- `PippengerScalingLegacy` = legacy MSM (`legacy`)
- `HARDWARE_CONCURRENCY` in `{2,4,8}`
- Google Benchmark real time

| n | HC2 fast | HC2 leg | HC2 x | HC4 fast | HC4 leg | HC4 x | HC8 fast | HC8 leg | HC8 x |
|---|---|---|---|---|---|---|---|---|---|
| 131072 | 290 | 280 | **0.97** | 146 | 156 | **1.07** | 80 | 88 | **1.10** |
| 262144 | 540 | 528 | **0.98** | 273 | 288 | **1.05** | 140 | 161 | **1.15** |
| 524288 | 1039 | 1003 | **0.97** | 526 | 553 | **1.05** | 267 | 298 | **1.12** |
| 1048576 | 2129 | 1942 | **0.91** | 1073 | 1016 | **0.95** | 550 | 557 | **1.01** |
| 2097152 | 3509 | 3478 | **0.99** | 1779 | 1963 | **1.10** | 916 | 1042 | **1.14** |

`2^20` is the weak point: the rewrite is slower at HC2/HC4 and only ties at HC8.
The neighboring sizes do better, especially `2^21`.

## Stage shape

At HC8, native per-stage shares show the same high-level shape across sizes:

**fast**

| n | from_mont | schedule | sort | bucket_accum | reduce |
|---|---|---|---|---|---|
| 131072 | 0.7% | 5.1% | 0.2% | 92.0% | 2.0% |
| 262144 | 0.7% | 4.9% | 0.1% | 92.4% | 1.8% |
| 524288 | 0.7% | 4.6% | 0.1% | 92.8% | 1.7% |
| 1048576 | 0.6% | 4.8% | 0.1% | 93.6% | 0.9% |
| 2097152 | 0.8% | 6.9% | 0.1% | 89.1% | 3.0% |

**legacy**

| n | from_mont | schedule | sort | bucket_accum | reduce |
|---|---|---|---|---|---|
| 131072 | 1.1% | 0.8% | 4.4% | 83.4% | 10.3% |
| 262144 | 1.2% | 1.0% | 4.3% | 83.5% | 10.0% |
| 1048576 | 1.4% | 1.6% | 3.9% | 83.6% | 9.6% |

The rewrite spends almost all time in bucket accumulation. Legacy spends less share there
and more in reduction, but the absolute winner at `2^20` is driven by round count and
bucket-accumulation cost, not by a standalone reduction bottleneck.

## Native perf profile at 2^20, HC8

`perf record --call-graph dwarf` on a symbolized EC2 build, AMD EPYC 7R13 / Zen 3:

| % self | function |
|---|---|
| **67.9%** | `drain_batch<BN254>` |
| 12.6% | Stage6a worker scatter/loop around drain |
| 5.7% | `invert_vartime` |
| 2.9% | Stage4 digit scatter |
| 1.6% | `tree_reduce_in_place` |
| 1.4% | `apply_divstep_matrix` |
| 1.1% | `random_element` benchmark scalar generation |

`drain_batch` is the native floor: batch-affine point addition, mostly field multiplications.
The batched inversion is already amortized. That makes field arithmetic or Stage6a surgery a
large, risky project for a single benchmark point.

## Why 2^20 ties

The two implementations choose different window schedules:

| n | fast rounds (c) | legacy rounds (bits) | fast/legacy rounds | measured time fast/legacy |
|---|---|---|---|---|
| 2^19 | 20 (c=13) | 20 (b=13) | 1.00 | 1.12x fast |
| 2^20 | 20 (c=13) | 17 (b=15) | **1.18** | **1.01x fast/tie** |
| 2^21 | 16 (c=16) | 17 (b=15) | **0.94** | 1.14x fast |

At `2^19`, both implementations do the same number of rounds and fast wins on per-round
efficiency. At `2^20`, legacy jumps to a wider window and cuts to 17 rounds, while fast stays
at `c=13` and still does 20 rounds. The rewrite's per-round advantage is mostly consumed by
the 18% extra round work. At `2^21`, fast jumps to `c=16`, does fewer rounds than legacy, and
wins again.

## Why simply raising c is not enough

Forcing fast to use `c=14`, `c=15`, or `c=16` did not improve the `2^20` result.

The reason is structural:

- Fast uses signed Booth buckets, `2^(c-1)` buckets per window.
- The current fast path scatters into dense per-thread bucket buffers.
- Raising `c` increases bucket count sharply.
- Dense bucket clearing, dense scatter support, and cross-thread bucket reduction grow with
  bucket count.
- At `2^20`, the saved rounds do not yet pay for that dense-bucket overhead.

Legacy uses a sort-based schedule, so its wider `bits=15` choice has less dense per-bucket
overhead. It can profit from the round-count reduction earlier than the rewrite can.

### Occupancy correction — the cost is cache footprint, not empty slots

Important: at `n = 2^20` the buckets are **densely populated**, so the wider-`c` cost is *not*
wasted work on empty dense slots. Average points per bucket per window:

- `c=14` → `2^13` = 8192 buckets → **~128 points/bucket**
- `c=15` → 16384 → **~64/bucket**
- `c=16` → 32768 → **~32/bucket**

`n` (1M) far exceeds the bucket count at every usable `c`, so essentially every bucket is
populated — there are almost no empty slots to skip. This means the "avoid empty slots" premise
behind a sparse/touched-bucket path (candidates A/B below) has little headroom *at this size*.

The real cost of wider `c` here is **cache footprint**:

- `c=16` → 32768 × 64 B = **~2 MB per (thread, window) dense bucket buffer**, vs `c=13`'s ~256 KB.
- Zen 3 L2 is ~512 KB/core, so wider `c` spills the Stage6a scatter out of L2 into L3 → every
  bucket write becomes an L2 miss.
- Plus the `O(buckets)` Stage6b reduction grows ~8× from `c=13` to `c=16`.

So the most promising clean fix is **not** sparsity but **cache tiling of the dense layout**
(candidate C): process bucket sub-ranges in L2-sized tiles so the scatter stays resident. Its real
risk is the tiling tradeoff — it buys cache residency at the cost of **extra passes over the n
points** (memory bandwidth), so whether it nets out at `2^20` is genuinely uncertain and must be
measured.

**Decision branch from step-1 instrumentation:** measure populated vs scanned/cleared bucket slots
and the Stage6a-vs-Stage6b wall split under forced `c`.
- If occupancy is high / almost no empty slots (expected here) → pursue **C (cache-tiled dense)**,
  not A/B. If the extra-cost is in Stage6a → it's the scatter cache cliff (tiling); if in Stage6b →
  it's the reduction (tile/limit the reduction range).
- Only if step 1 surprisingly shows substantial empty-slot scanning → A/B become relevant.

## Ruled out

- **Window selector only:** forced wider `c` did not fix the point.
- **Batch memory budget:** increasing the budget from 32 MB to 128 MB regressed all tested
  sizes by roughly 7-10%; 32 MB appears cache-friendlier.
- **Batch balance:** changing the batch shape from `6+6+6+2` to `5+5+5+5` was neutral.
- **Native SIMD field multiplication on this hardware:** Zen 3 is AVX2-only. AVX2 lacks a
  useful 64x64-to-128 widening multiply. A faster SIMD Montgomery path would require a
  redundant-limb field implementation and is unlikely to beat scalar `MULX` asm on this box.

## Clean improvement plan

### 1. Keep the target narrow

Primary target:

- native BN254
- single MSM
- `n = 2^20`
- HC8, with HC4 as a guardrail

Non-targets:

- V8/browser behavior
- HC2 browser behavior
- broad field-layer rewrites
- speculative Stage6a arithmetic changes

### 2. Treat single-knob failures as evidence, not proof

The ruled-out items above were tested mostly as isolated changes. That is useful, but not
complete. Some combinations can be valid even when each component loses alone:

- a wider window can lose alone because dense bucket overhead grows
- a larger batch budget can lose alone because it hurts cache locality
- a different batch shape can be neutral alone because it does not change bucket density
- a sparse/touched-bucket path can lose alone at `c=13` because dense buckets are already cheap

The relevant question is whether a combination changes the cost curve enough that wider windows
become profitable at `2^20`.

### 3. Solution candidates

#### A. Sparse or hybrid buckets for wider windows

Make `c=14` or `c=15` cheaper by avoiding work on empty dense bucket slots:

- keep a touched-bucket list per worker/window
- reduce only populated bucket ranges
- avoid clearing/scanning dense regions that were never touched
- keep the current dense path for smaller windows or high-occupancy windows

NOTE (occupancy correction): at `2^20` buckets are densely populated (~32–128 pts/bucket), so this
candidate likely has little headroom *at this size* — keep it for sizes/configs where buckets are
sparse, but expect candidate C (cache tiling) to be the lever at `2^20`. Gate on step-1 occupancy.

Combinations to test:

- sparse/hybrid Stage6 + `c=14`
- sparse/hybrid Stage6 + `c=15`
- sparse/hybrid Stage6 + current 32 MB budget
- sparse/hybrid Stage6 + adjusted windows-per-batch

#### B. Hybrid dense/sparse reduction only

Keep dense Stage6a accumulation, but change Stage6b to consume only touched bucket ranges.

This is narrower than a full sparse bucket path. It may help if forced wider windows lose mostly
in clearing/scanning/reduction rather than in the actual bucket additions.

Combinations to test:

- dense Stage6a + touched-list Stage6b + `c=14`
- dense Stage6a + touched-list Stage6b + `c=15`
- dense Stage6a + touched-list Stage6b + current batch budget

#### C. Window-specialized dense layout

Keep the dense algorithm, but reduce the fixed cost of the wider-window layout:

- avoid power-of-two over-padding when a tighter range is known
- split bucket ranges into smaller tiles
- clear only live tiles
- tune dense stride for `c=14/15`

This is lower disruption than a full sparse path, but it may be too incremental if the main
problem is the number of dense slots rather than padding.

Combinations to test:

- tiled dense layout + `c=14`
- tiled dense layout + `c=15`
- tiled dense layout + balanced windows-per-batch

#### D. Backend-aware window selection

Do not replace `choose_window_bits` with a one-line special case. Instead, make the selector aware
of the selected bucket backend:

- current dense backend keeps the current `c=13` choice at `2^20`
- sparse/hybrid backend may allow `c=14` or `c=15`
- selector uses measured backend costs, not just point count

This should only happen after A, B, or C proves that a backend makes wider windows profitable.

Combinations to test:

- backend-aware selector + sparse/hybrid Stage6
- backend-aware selector + tiled dense layout
- backend-aware selector + existing dense path as fallback

#### E. Legacy-style sort fallback for the crossover band

Use the legacy sort-based accumulation strategy only for the native `2^20` crossover band.

This is conceptually direct: legacy already wins or ties there because sort-based accumulation can
profit from `bits=15` without dense per-bucket overhead. The downside is code complexity and
maintaining two large accumulation strategies in the rewrite path.

Combinations to test:

- sort-style accumulation + `bits=15` for `2^20`
- sort-style accumulation only when dense backend predicts `c=13`
- sort-style accumulation behind a narrow native-only threshold

This should be a fallback idea, not the first implementation choice.

### 4. Reproduce the baseline

Run the native matrix for:

- sizes: `2^19`, `2^20`, `2^21`
- concurrency: HC4 and HC8
- implementations: fast and legacy

For `2^20`, collect:

- total wall time
- Stage6a wall
- Stage6b wall
- chosen `c`
- number of rounds
- windows per batch
- dense stride
- bucket count

### 5. Measure forced windows and combinations

For `2^20`, force fast through the current dense backend first:

- `c=13`
- `c=14`
- `c=15`
- `c=16`

For each run, record:

- total wall time
- Stage6a wall
- Stage6b wall
- dense bucket bytes
- number of populated buckets
- number of scanned bucket slots
- `perf` top functions

The key question is whether wider windows lose because they clear/scan too many empty dense
slots, because Stage6a gets worse, or because Stage6b gets worse.

Then test combinations instead of only isolated knobs:

- backend: dense, sparse/hybrid, reduction-only sparse, tiled dense
- window: `c=13`, `c=14`, `c=15`
- batch shape: current, balanced
- memory budget: 32 MB first; only retest larger budgets if the backend changes locality enough
  to make the old 128 MB result irrelevant

The 128 MB budget should not be considered permanently ruled out in combination with a new bucket
backend. It was ruled out for the current dense path.

### 6. Prototype order

Use a staged prototype order so the result is interpretable:

1. Add instrumentation for touched buckets, scanned slots, cleared slots, and Stage6a/Stage6b
   wall time under forced `c`. **This is the pivotal branch point** (see occupancy correction):
   - high occupancy / few empty slots + extra cost in Stage6a → go to C (cache tiling).
   - high occupancy + extra cost in Stage6b → tile/limit the reduction range.
   - substantial empty-slot scanning (not expected at 2^20) → A/B become relevant.
2. Pursue the branch step 1 indicates. Expected at `2^20`: **C (cache-tiled dense layout)** for
   `c=14/15` so the scatter stays L2-resident; measure whether the extra point passes are paid back.
3. If the cost is in Stage6b, prototype reduction-only tiling/touched ranges (smallest change).
4. Only if step 1 shows real sparsity, prototype sparse/hybrid bucket storage (A/B).
5. If a backend makes wider windows profitable, add backend-aware window selection (D).
6. Only then revisit batch shape and memory budget in combination with the winning backend.

The intended outcome is that `c=14` or `c=15` becomes profitable at `2^20` without hurting
`2^19` or `2^21`.

### 7. Decision gate

Land the change only if:

- native `2^20` HC8 improves meaningfully over current fast
- native `2^20` HC8 clearly beats legacy
- HC4 does not regress materially
- `2^19` and `2^21` do not regress
- the implementation is simpler than maintaining a one-point special case

If the sparse/hybrid path only wins one isolated benchmark by a small amount, do not land it.
Keep the existing implementation and preserve this note as the explanation.

## Recommendation

Treat native `2^20` as a dense-bucket/window-size crossover. The only promising clean fix is
making wider fast windows cheaper, probably through a sparse or hybrid bucket path. If that
does not beat the current dense path across the guardrail matrix, leave the implementation
alone.

## RESOLUTION (supersedes candidates A–E)

The 2^20 tie — and a systematic native loss at *every* size — was a **window-size cost-model
miscalibration**, not a bucket-backend problem.

### What went wrong in the earlier analysis

The plan above is built on "forcing wider c did not improve 2^20." That measurement was wrong: it
was a 5-iteration run that came out flat/noisy (`c=14/15/16 ≈ 555/554/558`). Clean 10-iteration
runs on **both** the stripped release build and a symbolized build **agree**, and the trend is
monotonic and large.

### Forced-c sweep (HC8, `pippenger_bench`, production build)

Optimal c is far above the model's pick at every size, and identical across HC2/HC4/HC8:

| n | model c | model time (ms) | best c | best time (ms) | speedup |
|---|---|---|---|---|---|
| 2^17 | 11 | ~70 | 13–15 | 66 | ~6% |
| 2^18 | 12 | 141 | 15 | 122 | ~13% |
| 2^19 | 13 | 280 | 16 | 243 | ~13% |
| 2^20 | 13 | 551 | 16–17 | 471 | ~15–17% |
| 2^21 | 16 | 929 | 17 | 906 | ~2% |

HC2/HC4 confirm wider c wins there too (e.g. 2^20: HC2 c=17 1716 vs c=13 2146 = −20%; HC4 c=17 870
vs c=13 1075 = −19%; 2^21 HC2 −23%). The optimal c is **HC-independent**, so a single constant fixes
all thread counts.

### Root cause

`choose_window_bits` native cost model: `cost = rounds * (n + BUCKET_ACC_COST * buckets)`.
- fast used **`BUCKET_ACC_COST = 15`**; legacy uses **5**.
- 15 over-weights the per-bucket term → the model under-sizes c by ~3 → too many rounds → ~13–20%
  slower than the achievable optimum at every native size.

### Fix

`BUCKET_ACC_COST = 15 → 3` (matched against the measured optima; reproduces c within 1 of empirical
at all sizes). It only changes the MSM's internal window schedule — the group-element result is
identical — so **no VK / correctness impact**, native-only (the wasm branch is separate), and it
helps **every** native size, not just 2^20.

### Why this beats the A–E backend ideas

Candidates A–E assumed wider c was unprofitable and tried to make the dense-bucket path cheaper.
The measurement shows wider c is *already* profitable — fast just wasn't selecting it. No
sparse/hybrid/tiled backend or new code path is needed; it's one constant. (The occupancy analysis
still holds — buckets are dense at 2^20 — but the dense path is fine at c=16/17; the round savings
outweigh the larger reduction.)

### Confirmed result (BUCKET_ACC_COST=3, natural selection, full matrix)

New model picks c = 13,14,16,16,16 for 2^17..2^21. Wall (ms), fast-new vs fast-old vs legacy:

**2^20 — the target: fast goes from losing/tying to winning at every HC**

| HC | fast old | fast new | legacy | old leg/fast | new leg/fast |
|---|---|---|---|---|---|
| 2 | 2129 | 1773 | 1942 | 0.91 (lost) | **1.10** |
| 4 | 1073 | 907 | 1016 | 0.95 (lost) | **1.12** |
| 8 | 550 | 474 | 559 | 1.01 (tie) | **1.18** |

**fast new/old speedup across the matrix** (lower = faster after fix):

| n | HC2 | HC4 | HC8 |
|---|---|---|---|
| 2^17 | 0.85 | 0.87 | 0.85 |
| 2^18 | 0.88 | 0.89 | 0.91 |
| 2^19 | 0.85 | 0.86 | 0.90 |
| 2^20 | 0.83 | 0.85 | 0.86 |
| 2^21 | 1.01 | 1.01 | 1.02 |

~11–17% faster at 2^17–2^20 across all thread counts. **2^21 is unchanged** — both old and new
models pick c=16 there, so the schedule is identical; the ±1–2% is run noise (HC8 repeats: 927 /
965 / 947 ms; old 916 sits in that band). 2^21's true optimum is c=17 (~3% better) but no single
`BUCKET_ACC_COST` reaches it without over-picking small sizes (BAC≤2 → c=16 at 2^17, measured
*slower*) or exploding c at very large n — not worth ~3% for those regressions.

**Decision gate (from the plan): met.** 2^20 HC8 beats current fast (−14%) and clearly beats legacy
(1.18×); HC4/HC2 also win; 2^19 improves and 2^21 doesn't regress; the change is one constant, far
simpler than any backend special-case.
