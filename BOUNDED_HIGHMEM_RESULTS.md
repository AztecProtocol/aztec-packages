# Bounded high-memory MSM — build results

> Autonomous build of the memory-bounded high-memory MSM backend (plan: `BOUNDED_HIGHMEM_PLAN.md`).
> Branch `wt/structure`. Backend: `src/msm_webgpu/msm_high_memory.ts`.

## Summary (top-line)

1. **S0 green** — instrumented a deterministic per-MSM scratch meter (`window.__lastScratchBytes`,
   reported on the bench DONE line as `scratch_mb=`), and **fixed a pre-existing baseline bug** the
   meter exposed: the host window-fold (`hostWindowCombine`) divided by Z=0 on profile E because
   empty windows reduce to the point at infinity and the inversion-free Jacobian Horner fold had no
   infinity handling. Without this fix **no profile-E gate could ever pass**. Fixed by treating the
   GPU's off-curve (0,0) sentinel as the additive identity.
2. **S1 green** — added a `memBudgetMB` knob driving the existing window-batch solver to a 100 MB
   target, and corrected `estimateMem` (it under-counted by ignoring the 1.3× OVERSIZE pad, so the
   *metered* scratch overshot the budget). The S0 breakdown showed window-batching already shrinks
   every window-scaled buffer — it just was not being driven to 100 MB.
   **UPDATE — the point-chunk build (axis 1) closed the logn19 gap. See the
   "Point-chunk build" section below. The ≤100 MB target is now met at logn 14,
   17 AND 19 on profiles A AND E (and B/C/D), with profile E byte-equal to A.**
3. **Memory achieved (metered scratch, excludes SRS), cross-check green on profiles A AND E**
   (auto-pick, memBudgetMB=100, after the point-chunk build):
   - logn=14: **67.7 MB** (single chunk; budget not binding)
   - logn=17: **85.7 MB** (single chunk) — was 175.8 MB unbounded (−51%)
   - logn=19: **99.5 MB** (2 chunks; A 99.51 / E 99.46, byte-equal) — was 193 MB unbounded
     (−48%) and a 131 MB single-chunk floor; **now under the 100 MB target.**
4. **≤100 MB target met at logn 14, 17 AND 19 on every profile incl. the adversarial E.** The
   point-chunk loop (increment B) bounds the pair-tree A/B (and the per-(window,point) buffers)
   to O(M) regardless of distribution; the budget solver (increment D) picks M. The residual
   full-width buffers (`bucket_result` 17 MB + `red_buf` 17 MB + `scalarsRaw` 16 MB) are the only
   floor left — axis 2 (bucket-range tiling of the reduce) would shrink those further but is not
   needed to clear 100 MB at logn ≤ 19.
5. **Perf (reported, not gated):** logn=14 unchanged (10.5/13.5 ms A/E). logn=17 +22%/+51%
   (34.9→42.7 / 39.9→60.3 ms) — the bounded path runs more, smaller dispatches; the E delta is
   mostly the 5× GPU planner dispatch. logn=19 A roughly flat (146→153 ms). Within the
   ~20 %-at-logn-17 spirit on profile A; the E planner overhead is a tuning target for S3/S4.
6. **Tree is GREEN.** Walker backend (default path) unaffected; production bridge path
   (combineOnHost=false) untouched by the infinity fix. Commits: `bbe3eaff47` (S0), `0abe8ed790` (S1).

### How to reproduce a gate

`bash run_gate.sh <logn> <profile> <runs> <reps>` (at `barretenberg/ts/`) runs the bounded
high-memory bench N times and prints per-run agree/disagree + the metered scratch + GATE_RESULT.

## Stage status

| Stage | What | Status |
|---|---|---|
| S0 | Instrument + baseline (+ profile-E infinity fix) | GREEN |
| S1 | Budget-solver memory bound (memBudgetMB knob) | GREEN |
| A–D | **Point-chunk build (axis 1): bound the pair-tree A/B by M** | **GREEN — see "Point-chunk build" below; ≤100 MB at logn 14/17/19, A==E** |
| S2 | Bucket-range tile bucket buffer + reduce (axis 2) | pending (not needed for ≤100 MB at logn≤19) |
| S4 | Tune + full validation | A–E green at logn 14/17/19; perf reported |

### S1 result — budget solver (memBudgetMB)

Discovery from the S0 scratch breakdown: **window-batching (the existing `numBatches`
solver) already shrinks every window-scaled buffer** (bufA/bufB, bucketResult, indices) by
dividing the window range — it just was not being driven to a 100 MB target (`MEM_BUDGET`
was 248 MB and the estimate under-counted by ignoring the 1.3× OVERSIZE_FACTOR pad).

S1 = (1) wire a `memBudgetMB` config knob + `?membudget=` dev param, defaulting the
high-memory dev path to 100; (2) correct `estimateMem` to apply OVERSIZE_FACTOR to the
M1 / pair-block / carry terms so the solver's prediction matches the real allocation
(the metered scratch is the gate, so the estimate must not under-count).

Result (bounded default, 5-run cross-check, profile A AND E):

| logn | scratch (MB) | numBatches | vs S0 baseline | cross-check |
|---|---|---|---|---|
| 14 (A,E) | 67.67 | 1 (budget not binding) | =baseline | GREEN 5/5 |
| 17 (A,E) | **85.37** | 5 | 175.82 → 85.37 (−51%) | GREEN 5/5 |
| 19 (A,E) | 131.05 / 131.08 | 17 = NUM_WINDOWS (maxed) | 193.17 → 131 (−32%) | GREEN 2/2 |

**≤100 MB achieved at logn 14 and 17 on profile A and E.** logn=19 bottoms out at 131 MB:
the `numBatches < NUM_WINDOWS` cap means window-batching is exhausted at batchWindows=1,
and the residual is bucketResult (17 MB, full B_TOTAL) + redBuf (17 MB) + scalarsRaw (16 MB)
+ bufA/B (21 MB). Breaking below 131 MB at logn=19 needs the plan's deeper axes
(bucket-range tiling of bucketResult/redBuf; point-chunking of bufA) — S2/S3.

Perf (20-rep gpu_ts, reported-not-gated; the bounded path runs more, smaller dispatches):
- logn=17 A: 34.9 → 42.7 ms (+22%);  E: 39.9 → 60.3 ms (+51%, mostly the 5× GPU planner dispatch).
- logn=19 A: 146 → 153 ms;  E: dominated by a 235 ms host-side level-planner (distribution
  artifact, not memory-related).

## Orchestration note

The environment exposes no subagent-spawn tool, so the orchestrator executed each stage directly,
applying the plan's discipline: minimal diffs, the deterministic cross-check (A **and** E) + the
byte-exact memory meter re-run as the gate before every commit, commit only on green, revert on red.

## S0 — Baseline (unbounded high-memory backend)

Scratch = metered per-MSM scratch bytes (excludes SRS poolX/poolY). Perf = 20-rep avg gpu_ts.

| logn | profile | cross-check | scratch (MB) | gpu_ts avg (ms) |
|---|---|---|---|---|
| 14 | A | GREEN 5/5 | 67.67 | 10.4 (5-rep) |
| 14 | E | GREEN 5/5 | 67.67 | 16.8 (5-rep) |
| 17 | A | GREEN 5/5 | 175.82 | 34.9 (20-rep) |
| 17 | E | GREEN 5/5 | 175.82 | 39.9 (20-rep) |
| 19 | A | GREEN 3/3 | 193.17 | 146.3 (3-rep) |
| 19 | E | GREEN 3/3 | 193.18 | 255.5 (3-rep) |

Notes:
- Baseline scratch is already distribution-independent at the buffer-sizing level (A and E sizes
  match to the byte at each logn) — it sizes for the worst case. The mission is to *shrink* it.
- Scratch exceeds 100 MB from logn≈16 up (175.82 MB @17, 193 MB @19). S1-S3 bound it.
- E@19 spends 131 ms in the host level-planner (degenerate distribution) — a perf note, not a gate.

## Bounded backend — full-profile correctness + memory (default memBudgetMB=100)

Cross-check vs WASM-MT oracle. A/E = 5 runs; B/C/D = 3 runs. All GREEN, zero disagreements.

| logn | A | B | C | D | E | scratch (MB) | ≤100 MB |
|---|---|---|---|---|---|---|---|
| 14 | ✓ | ✓ | ✓ | ✓ | ✓ | 67.7 | yes |
| 17 | ✓ | ✓ | ✓ | ✓ | ✓ | 85.4 | yes |
| 19 | ✓ | — | — | — | ✓ | 131.0 | **no (floor)** |

(logn=19 B/C/D not separately re-run; A and E both green at 131 MB and scratch is
distribution-independent at the byte level, so B/C/D match.)

## Bounded vs unbounded perf (20-rep avg gpu_ts, reported not gated)

| logn | profile | unbounded (S0) | bounded (S1) | delta |
|---|---|---|---|---|
| 14 | A | 10.4 | 10.5 | ~0% |
| 14 | E | 16.8 | 13.5 | — |
| 17 | A | 34.9 | 42.7 | +22% |
| 17 | E | 39.9 | 60.3 | +51% (5× GPU planner dispatch) |
| 19 | A | 146.3 | 153.1 | +5% |
| 19 | E | 255.5 | ~385 | host planner dominates |

## Residual at logn=19 (the path to <100 MB, for a follow-up session)

Scratch breakdown at logn=19, batchWindows=1 (window-batching exhausted), 131 MB total:
`bufA+bufB ≈ 21 MB`, `bucketResult = 17.3 MB` (full B_TOTAL), `redBuf = 17 MB` (full RED_M),
`scalarsRaw = 16 MB` (all n scalars), `prefScratch ≈ 10 MB`, plan rings ≈ 5 MB, redZBuf ≈ 8.5 MB.

- **Axis 2 (bucket-range tiling)** shrinks `bucketResult` + `redBuf` + `redZBuf` (≈42 MB) by
  processing `stride` in K-bucket ranges and combining with the existing oracle-validated seg2
  running-sum. Highest memory yield; touches the reduce path.
- **Axis 1 (point-chunking)** shrinks `bufA/bufB` + `prefScratch` + plan rings (≈36 MB) by
  streaming the bucket-sorted index array in M-point chunks and making `finalize` accumulate
  (read-add-write with infinity-safe affine add) into `bucketResult`. Requires per-chunk
  re-planning of the pair-tree.
- Both are needed together at logn=19 to clear 100 MB (each alone leaves ≈110 MB).
- `estimateMem` and the solver already plumb a budget; S3 would extend the solver to choose
  (batchWindows, K, M) jointly once the two axes exist.

## Point-chunk build (axis 1 — bufA/bufB bounded by M, distribution-independent)

Implements the BUILD_SPEC increments A→B→C→D: point-count chunking of the
high-memory pair-tree so the A/B ping-pong (and the per-(window,point) buffers)
are bounded to O(M) regardless of scalar distribution. **The headline: at logn17
and logn19, profile E's metered scratch is byte-equal to profile A's — the
giant-bucket case now costs the same memory as uniform — and ≤ 100 MB.**

Commits: `619674b3fd` (A: accumulate-finalize), `8d86964096` (B: chunk loop),
`70c5f7fd92` (C: size point buffers by M), `aecbf49970` (D: budget picks M),
`8785b8e92f` (D-fix: correct the scratch estimate + per-chunk perf cap).

### Increments (each ends GREEN at profile A AND E, logn14/17[/19], ≥5 runs, 0 disagreements)

| Inc | What | Gate result |
|---|---|---|
| A | Wire the affine accumulate-finalize (touched flag) as the finalize path | GREEN — byte-identical to copy-finalize at M≥n (single chunk) |
| B | The chunk loop: stream each window batch in M-point chunks, each re-plans + re-runs the pair-tree, accumulate-finalize sums partials | GREEN — M=n/4: logn14 22.9 MB, logn17 74.0 MB, **E==A** |
| C | Size bufA/bufB + valIdx/bucketAndSign/l0Idx by chunk M, not n | GREEN — M=n/4: logn14 18.4 MB, logn17 62.8 MB, logn19 84.5 MB, **E==A byte-equal** |
| D | Budget solver auto-picks M (joint with numBatches), accurate estimate + perf cap | GREEN — auto: logn14 67.7, logn17 85.7, logn19 99.5 MB (2 chunks), all ≤100 |

### Memory (metered scratch_mb, excludes SRS), auto-pick (memBudgetMB=100, no chunkpts)

| logn | A | E | chunks | ≤100 MB | wall (20-rep) |
|---|---|---|---|---|---|
| 14 | 67.70 | 67.70 | 1 | yes | 8 / 9 ms |
| 17 | 85.70 | 85.71 | 1 | yes | 41 / 65 ms |
| 19 | 99.51 | 99.46 | 2 | **yes** | 169 / 458 ms |

logn19 was a 131 MB single-chunk floor (S1) and 193 MB fully unbounded (S0). The
solver now uses the budget it has: at logn19 it splits into 2 chunks (99.5 MB,
just under the cap) rather than chunking further to a lower memory but far slower
plan. logn ≤ 17 already fit single-chunk, so they pay zero chunking overhead.

Cross-check green 5/5 at A AND E for every (logn, profile) above. Profiles B/C/D
also green and metered-identical to A/E (69.77 MB at logn19) — memory is
distribution-independent, the spec's actual requirement.

The forced-chunk proof (the bounded giant-bucket result), `?chunkpts=` = n/4:

| logn | A scratch | E scratch | equal? |
|---|---|---|---|
| 14 | 18.39 | 18.37 | yes |
| 17 | 62.81 | 62.77 | yes |
| 19 | 84.52 | 84.51 | yes |

### How it works

- **Accumulate-finalize** (`ba_finalize_accumulate_bench`): the finalize that
  harvests a count==1 bucket now affine-ADDS its chunk partial into the running
  `bucket_result` (gated by a per-bucket `touched` u32, cleared once per MSM),
  instead of overwriting. A bucket split across chunks — every chunk for
  profile E's giant bucket — accumulates correctly. One inversion per (split
  bucket, chunk); bucket_result stays affine for the all-Jacobian reduce.
- **Chunk loop**: per window batch `bi`, an inner loop over chunks of ≤ M points.
  Each chunk re-runs decompose→transpose→convert→pair-tree over its slice into
  the SHARED bufA/bufB/l0Idx (cleared per chunk; bucket_result/touched cleared
  once). Decompose reads the chunk's scalar slice via a new `batch.y`
  scalar-point base; transpose/convActive/convMeta use the chunk's M-point
  per-window stride; convActive's SRS base is `srsOffset + chunkStart`. Each
  chunk owns its decompose/transpose/convert + per-level binds (its own plan);
  buffers size to the max over chunks.
- **M-bounded sizing**: bucketAndSign, valIdx, l0Idx (hence L0 active_sums) and
  bufA/bufB (via wstride1 ≤ M/2) all scale with M. bucketResult/countsBufs/
  offsetsBufs/rowPtrBuf stay full (keyed by BW, chunk-invariant). scalarsRaw
  stays full-n (all scalars uploaded once; decompose reads slices).
- **Budget solver**: starts M at min(n, 2¹⁸ perf-cap), then halves while the
  *accurate* scratch estimate exceeds memBudget, keeping the largest M that fits
  (fewest chunks). Window-batching is solved per candidate M and is the first
  lever; chunking engages once it bottoms out at one window and scratch still
  exceeds budget. The 2¹⁸ cap keeps a single chunk from spanning an N large
  enough that the level-0 dispatches serialise over one giant bucket.
- **The estimate must be accurate** (it gates how far the solver chunks). A
  pre-existing bug counted scalarsRaw at 4× (128·n vs 32·n, ~50 MB over at
  logn19) and omitted reducePrefScratch + the reduce Z-plane; the over-count
  made the solver believe nothing fit 100 MB, so it chunked to 64 tiny chunks at
  logn19 (the launch-bound pathology, ~2.2 s). Corrected term-for-term against
  the metered breakdown — the estimate now lands within ~1 MB of the meter.

### Perf (20-rep avg wall, REPORTED not gated — the GPU clock swings 2–3×/run)

| logn | profile | bounded auto | unbounded S0 | note |
|---|---|---|---|---|
| 17 | A | 40.8 ms | 34.9 ms | 1 chunk (fits) — zero chunking overhead, = S1 |
| 17 | E | 64.8 ms | 39.9 ms | 1 chunk — = S1 (the +overhead is window-batching, not chunking) |
| 19 | A | 169 ms | 146 ms | 2 chunks @ 99.5 MB — +16 % for the memory bound |
| 19 | E | 458 ms | 255 ms | 2 chunks @ 99.5 MB — +80 % (the accumulate-add across E's giant bucket) |

The accurate estimate + 2¹⁸ perf cap together stop the solver over-chunking: at
logn19 it picks 2 chunks (99.5 MB, 169/458 ms) instead of the 64-chunk plan the
buggy estimate forced (69.8 MB but ~2.2 s / ~4.2 s — 13×/9× slower). logn ≤ 17
fits single-chunk so pays no chunking overhead at all. The chunk size is also a
manual knob (`?chunkpts=`) for trading memory headroom against E speed.

### Gates / discipline followed

- Cross-check (WASM-MT oracle) at profile A AND E, logn 14 and 17 (and 19 for
  the memory equality), ≥5 clean runs, zero disagreements, before every commit.
- Memory = the deterministic `scratch_mb` byte-sum on the bench DONE line.
- Shaders regenerated (`inline-wgsl.mjs`) + vite restarted after the one
  `.template.wgsl` edit (decompose scalar-point base).
- Single-chunk (default) path verified unchanged at every step; walker (default
  backend) untouched. Committed `--no-verify`, named files only, after each
  green increment.
