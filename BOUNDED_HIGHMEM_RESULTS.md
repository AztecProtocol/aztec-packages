# Bounded high-memory MSM — build results

> Autonomous build of the memory-bounded high-memory MSM backend (plan: `BOUNDED_HIGHMEM_PLAN.md`).
> Branch `wt/structure`. Backend: `src/msm_webgpu/msm_high_memory.ts`.

## Summary (top-line, updated at end)

_in progress — S0 green, S1 starting_

S0 found and fixed a **pre-existing baseline bug**: the dev harness's host window-fold
(`hostWindowCombine`) divided by Z=0 ("value is not invertible") on profile E because empty
windows reduce to the point at infinity and the Jacobian fold had no infinity handling. Without
this fix no profile-E gate could ever pass. Fixed by treating the (0,0) GPU sentinel as the
additive identity. Cross-check green on A and E at logn 14/17/19 after the fix.

## Stage status

| Stage | What | Status |
|---|---|---|
| S0 | Instrument + baseline (+ profile-E infinity fix) | GREEN |
| S1 | Budget-solver memory bound (memBudgetMB knob) | GREEN |
| S2 | Bucket-range tile bucket buffer + reduce | pending |
| S3 | Budget solver → 100 MB | pending (S1 already does ≤17) |
| S4 | Tune + full validation | pending |

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
