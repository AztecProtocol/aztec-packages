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

## Stage 4 — task-driven analytic path (?wi3=1): implemented, validated, REJECTED on perf

Implemented idx_cuts/idx_place (the ported emission rules; arrival counted
atomically too, so idx_alloc runs unchanged). Equivalence gates ALL GREEN on
M4: wi2==wi3 window sums at logn 10/14 (+noble), 16/17 uniform, 14/17 E,
17 D, 17 B, 17 clustered(64) — the emission-model port is bit-faithful.

Perf: M4 72 µs (flat vs wi2's 73). Mali: cuts 94 + alloc 124 + epi 24 +
place 138 + sort 28 ≈ 407 µs busy, span ~500 µs — REGRESSES wi2 (~437 µs).
The task-wide kernels swap partial_dest's coalesced reads + 123K atomics for
~4 scattered sorted_count/bucket_list gathers per task; on Mali the gathers
cost more than the atomics saved. Adreno not captured (moot after Mali).

Verdict: wi2 (Stage 3) is the shipping configuration. wi3 stays behind its
flag as a validated experiment; if it ever wins, it also lets stream_walker
stop writing partial_dest (handoff note for the walker owner).

## Final scorecard (logn=17 uniform, walker_index phase)

| device | baseline | shipped (wi2) | speedup |
|---|---:|---:|---:|
| M4 | 244 µs | 73 µs | **3.3×** |
| Adreno (S25+) | 332 µs | ~156 µs | **2.1×** |
| Mali (Pixel 9A) | 1035 µs | ~437 µs | **2.4×** |

(Adreno final from the wi2-v2c capture — pre is_present-hoist; the hoist
moved ~10 µs of scattered stores into classify's existing pass.)

## wi4 "sorted-runs" design — Phase 0/1 verdict (gated plan, 2026-06-09)

**Phase 0 (G0): GREEN, 11/11 configs.** CPU verification of live GPU data
(uniform 10/14/16/17, B/C/D 17, E 14/17, clustered 17, nb=2 16):
partial_dest live entries are monotone in dense-bucket order; within-bucket
hole runs are exactly <= 1; the planned block-export head rule and
head-to-head count rule reproduce ground truth with ZERO mismatches; and
segments == active_count everywhere. The structural theory is correct.
(Also closed: the split-c checker timeouts were the cold SRS GPU-decompress
racing the page-load window — split-c gates now PASS at 16/17 and 17+C.)

**Phase 1 (G1): FAIL.** Probe kernels (wi_p1 sweep / wi_p2 build) pricing
the design's exact memory/compute shape on real data, driver-measured:

| device | P1 | P2 | wi4 projection | v2 same-trace |
|---|---:|---:|---:|---:|
| Mali   | 43.6 | 175.2 | ~340–370 µs | ~330 busy / 437 span |
| Adreno | 19.3 | 78.5  | ~130 + drains | ~136 busy |
| M4     | 10   | 17    | ~46 µs | 73 µs |

Abort criteria were P2 > 180 µs or projection > ~320 µs Mali: borderline-
exceeded; best-case win ~1.2–1.3×, under the 1.4× ship bar. Root cause:
the atomics the design removes were never the dominant cost — wi_count's
123K global atomicAdds run at near-bandwidth (57 µs for 524 KB + RMW).
The output traffic (~2 MB of layout/count/offset/pair writes) plus the
rank-scan barriers set the floor, and the sorted-runs build pays those
the same as v2 does. v2 is within ~25–30%% of any within-contract rebuild.

Verdict: v2 stands as the shipped algorithm. The probes (?wiprobe=1) and
the Phase-0 validator (?deep=1) remain in-tree so the negative result is
reproducible. M4 would gain ~1.6x from wi4 — on record if M4-only wins
ever matter enough to carry a Mali-neutral second path.

## Cleanup (final state)

The parallel pipeline is now the ONLY walker_index path: the v1 kernels
(combine count/scan/scatter/filter + the 3-kernel counting sort) and the
wi3 analytic experiment are deleted; the flags are gone. wi2-check now
validates determinism (two fresh instances, identical window sums) + the
noble reference. The ?wiprobe=1 cost probes and ?deep=1 validator remain.
Full gate matrix green on the single-path build; M4 logn=17: phase 75 µs,
wall 31.8 ms.
