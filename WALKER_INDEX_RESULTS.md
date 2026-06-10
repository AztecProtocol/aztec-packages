# walker_index — measurements log

## Stage 1 baseline (2026-06-09)

### Workload truth (M4, walker-index-stats probe)

| metric | logn=17 uniform | logn=17 prof D | logn=17 prof E | logn=14 uniform |
|---|---:|---:|---:|---:|
| c / windows | 13 / 20 | 13 / 20 | 13 / 20 | 8 / 32 |
| bTotal | 87040 | 87040 | 87040 | 8192 |
| streamNumThreads (walkerNwg) | 8192 (128) | 8192 (128) | 8192 (128) | 8192 (128) |
| M partial slots | 131072 | 131072 | 131072 | 131072 |
| num_dense | 77921 | 77921 | 15 | 4016 |
| total partials (live slots) | 123480 | 116651 | 65543 | 69093 |
| singles (count==1) | **0** | **0** | **0** | **0** |
| active (count>=2) | 59939 | 55085 | 15 | 4016 |
| N histogram | 59499@2, 343@3, 1@10, 97@33–38 | 54244@2, 741@3, tail, 3@64+ | 15@64+ | broad 7–23 + 38–49 tail |

Notes:
- live slots = 94% of M at logn=17 uniform → W1 compaction wins little there;
  worth it for E (50%) and smaller n. Keep, but it is not the headline.
- actives ≈ 77% of dense at logn=17 (NOT ~16K as old comments said) — the
  sort stage is a major workload, justifying WG-aggregated bins.
- singles=0 across every profile tested — keep the count==1 contract path,
  spend zero effort optimizing it.
- GPU countHistogram == CPU-derived histogram in all runs (readback sane).

### Per-sub-kernel GPU time (timestamp queries)

M4 (logn=17 uniform, median of 7):

| kernel | µs |
|---|---:|
| wi_count | 12 |
| wi_scan | **92** |
| wi_scatter | 17 |
| wi_filter | 14 |
| wi_sort_count | 47 |
| wi_sort_scan | 10 |
| wi_sort_scatter | 51 |
| **phase total** | **244** |

(logn=14: phase total 52 µs.) Wall logn=17: 33.0 ms; stream_walker 19.7 ms,
reduce 6.2 ms dominate overall.

Phones (N=2^17, baseline perfetto traces, slice durations):

| kernel | Adreno µs | Mali µs |
|---|---:|---:|
| count | 25 | 58 |
| scan | 176 | 394 |
| scatter | 28 | 105 |
| filter | 34 | 98 |
| sort_count | 32 | 139 |
| sort_scan | 6 | 26 |
| sort_scatter | 30 | 143 |
| bubbles | ~1 | ~70 |
| **phase total** | **332** | **1035** |

Counters: Adreno ALU 4.9% during phase; Mali starvation max / core-active min
of all phases.

## Stage 2 — walker_index v2 (?wi2=1), M4 (2026-06-09)

Correctness gates (wi2-check: v1 vs v2 exact window-sum equality; noble JS
reference at logn≤14): PASS at logn 10/14 (noble), 16/17 uniform, 14/17
profile D, 14/17 profile E, 17 profile C, 17 clustered(64). v2 GPU histogram
== CPU-derived histogram on the stats probe.

M4 logn=17 uniform, median of 7 (timestamp queries):

| kernel | v1 µs | v2 µs |
|---|---:|---:|
| wi_count | 12 | 17 |
| wi_scan | 92 | — |
| wi_alloc (scan+filter+sort_count fused) | — | 24 |
| wi_epilogue | — | 8 |
| wi_scatter | 17 | 20 (incl singles copy) |
| wi_filter | 14 | — |
| wi_sort_count | 47 | — |
| wi_sort_scan | 10 | — |
| wi_sort_scatter / wi_sort | 51 | 11 |
| **phase total** | **244** | **80 (3.05×)** |

Wall median 33.0 → 32.6 ms (phase win + the dead 512 KB partial_dest clear).
wi_count regressed 12→17 µs (indirect + planner_meta-dependent bound) —
Stage 3 follow-up.

## Stage 3 — device tuning (2026-06-09)

Experiments (phone traces, logn=17 uniform, per-MSM):

| variant | Adreno span | Mali span | notes |
|---|---:|---:|---|
| baseline v1 | 332 µs | 1035 µs | |
| v2 (Stage 2 kernels) | 151 µs | ~520 µs | Mali wi_alloc 193 µs (16-barrier scan), count 75, scatter 92 |
| v2 + vec4 count/scatter + 4-item alloc | — | ~455 µs | alloc 193→141 ✓ but count 75→84, scatter 92→169 ✗✗ |
| v2 hybrid (1-slot count/scatter, 4-item alloc) | **156 µs** | **437 µs** | count 60 / alloc 143 / epi 25 / scatter 91 / sort 27 |

Negative result worth keeping: vec4 (4 slots/thread) on the slot kernels
REGRESSES Mali ~2× — for latency-bound scattered-atomic work Mali wants more
threads in flight, not per-thread ILP. Adreno was roughly indifferent.

Final Stage-3 state (hybrid + is_present hoisted to classify):
- M4: phase 244 → **73 µs (3.3×)**; wall 33.0 → 32.7 ms.
- Adreno: 332 → **~156 µs (2.1×)**.
- Mali: 1035 → **~437 µs (2.4×)** (≈87 µs of that is 4 inter-dispatch
  bubbles + epilogue floor).
- All correctness gates green after every step (v1==v2 window sums,
  noble at logn 10/14, profiles B–E, clustered).

## Stage 4 analysis — the analytic index (worked, not shipped)

Full walker-emission model derived from ba_stream_walker init/retire rules
(see WALKER_INDEX_PLAN.md §S4-worked). Three load-bearing findings:

1. **count==1 buckets are structurally impossible** — a cut bucket always
   receives (arriving piece) + (per distinct interior cut) ≥ 2 partials.
   Matches singles=0 in every measured profile. The v2 scatter's bit-31
   singles path is provably dead code (kept as contract defence).
2. **The pure-analytic 3-dispatch form is NOT a clear win on Mali.** It
   needs per-bucket task-index ranges; the closed-form T_j inversion costs
   ~2 binary searches × 17 iters × 3 u32 divisions per dense bucket
   (~0.3–0.7 ms Mali — u32 division is slow), and the memory alternative
   (binary search over task_cuts) is ~3M scattered loads. Both exceed the
   ~150 µs of atomics they would remove.
3. **The viable middle form is task-driven**: task_cuts IS the cut table,
   already materialized by partition_task. K1′ (task-wide, 65K threads,
   coalesced cut reads, ported init rules) replaces wi_count;
   K3′ (task-wide) replaces wi_scatter with arriver/departer slot rules.
   Predicted Mali ~437→~300 µs, M4 ~73→~55 µs. Same bit-exactness risk as
   full analytic (the init-rule port), gated on the same validator.

Verdict: shipped through Stage 3; Stage 4 documented with the worked model
for a follow-up session (or the walker owner — if the index goes
cut-driven, stream_walker can stop writing partial_dest entirely).
