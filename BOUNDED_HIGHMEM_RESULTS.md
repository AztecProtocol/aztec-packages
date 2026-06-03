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
| S1 | Point-chunk the accumulate | in progress |
| S2 | Bucket-range tile bucket buffer + reduce | pending |
| S3 | Budget solver → 100 MB | pending |
| S4 | Tune + full validation | pending |

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
