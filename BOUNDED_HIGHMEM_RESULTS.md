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
3. **Memory achieved (metered scratch, excludes SRS), cross-check green on profiles A AND E:**
   - logn=14: **67.7 MB** (A,B,C,D,E all green; budget not binding)
   - logn=17: **85.4 MB** (A,B,C,D,E all green) — was 175.8 MB unbounded (−51%)
   - logn=19: **131 MB** (A,E green) — was 193 MB unbounded (−32%); **over the 100 MB target.**
4. **≤100 MB target met at logn 14 and 17 on every profile incl. the adversarial E.** logn=19 is
   green at 131 MB but not under 100: window-batching is capped at one window
   (`numBatches < NUM_WINDOWS`), and the residual is the full-width `bucket_result` (17 MB) +
   `red_buf` (17 MB) + `scalarsRaw` (16 MB) buffers. Closing it needs the plan's two deeper axes
   (S2 bucket-range tiling of the reduce buffers + S1-axis point-chunking of the pair-tree A/B);
   those are large, delicate rewrites of the two most complex subsystems (bin-packed pair-tree and
   the reduce) and were **not** attempted solo to avoid risking the green tree (per plan §7 +
   recovery protocol — a correct partial beats a broken whole).
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
