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
