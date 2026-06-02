# GPU MSM Arena Layout — phone-tight (≤160 MB), split-c-ready

Target: the live `stream_walker` + multi-dispatch pair-tree in `msm_v2.ts`
(`SharedScratch` on `MsmV2Pool`). Hard budget: **160 MB total GPU buffers.**
Designed to (a) collapse the ~49-buffer `SharedScratch` to a handful of arenas
(b) be sized deterministically against a fixed budget rather than grown
monotonically, (c) pack multiple MSMs per dispatch, and (d) accept the
variable-window **split-c** schedule as a layout-table swap, not a re-architecture.

**All sizes below are exact, traced to source — no estimates.** The one term not
closed-form from `n` alone (`reducePrefScratch`'s `MAXC`) is flagged.

> **DEVICE CONSTRAINT (verified on M-series, Dawn/Metal, 2026-06-01).**
> Binding the **same GPU buffer at two bindings in one bind group** — even
> non-overlapping sub-ranges — silently produces **wrong results (output 0)**.
> Proven by bisection: `ptScratch` carved from a shared arena passes alone at
> offset 0 *and* at a nonzero offset, but `ptScratch`+`ptTasks` (co-bound in the
> `ptCombine` bind group) outputs 0. **So this is NOT "one arena": two buffers may
> share an arena only if they are never co-bound in any single bind group.**
> Partition buffers by a co-binding conflict graph (graph-colour the 37 bind
> groups' co-occurrences) — never-co-bound buffers share an arena, co-bound ones
> go to different arenas. Still collapses ~49 buffers to a handful of arenas
> (allocate-once, deterministic, packable), just not to a single one.

---

## 0. What this fixes (and what was already fine)

Storage buffers are **already persistent** — one `SharedScratch`, grown
monotonically and reused (`ensureScratch`, `msm_v2.ts:755`); only the small
UNIFORM buffers are per-call. So "stop resizing every MSM" is already true for
storage. What actually costs per MSM on the slow path is the **bind-group
rebuild across ~49 bindings**, and what blocks the phone is the **fixed
thread-scratch (exactly 45.9 MiB at `sT=8192`, `ptScratch` alone 32 MiB — §3)**
plus the absence of a real memory-budget gate. The `MEM_BUDGET=248MB` /
`estimateMem` scaffold (`msm_v2.ts:41,2048`) is vestigial — batch count is driven
only by the 65 k-workgroup cap (`wgFits`, `msm_v2.ts:2069`) — **and `estimateMem`
omits the THREAD zone entirely, so wiring it as-is would under-budget by
~46 MiB.** The arena addresses all four.

---

## 1. Three allocations

| Allocation | Lifetime | Size | Binding |
|---|---|---|---|
| **SRS** `srsX`,`srsY` (SoA, 8×u32 Montgomery) | **session** (uploaded once, prefix-routed by `srsOffset`) | `2·srsN·32` = **8.0 MiB** at `srsN=2^17` | 2 storage |
| **arena** (one STORAGE buffer) | **batch** (bump-reset) | high-water of workload, ≤ budget−SRS (chonk: ~60 MiB at `sT=2048`, §3) | 1 storage |
| **layout** (offset table) | batch | a few KB (§4) | 1 storage |
| per-pass `params` | per dispatch | 16–64 B | 1 uniform (dynamic offset) |

**SRS stays outside the arena** — its lifetime is the session; the arena is
bump-reset per batch.

**Binding model.** One bind group `{arena, layout, srsX, srsY, params}` ≈ **5
entries**, rebuilt only when the arena buffer is reallocated (workload high-water
grows — rare after warm-up). The ~49-binding rebuild that is today's slow path
disappears.

**128 MiB phone storage-binding limit.** WebGPU's portable
`maxStorageBufferBindingSize` floor is 128 MiB (Mali/Adreno sit near it). We
**size the arena to the deterministic high-water (~60–95 MiB), not to the
budget**, so a single whole-arena binding is legal. If a workload's high-water
ever exceeds 128 MiB, bind the arena in zone-ranges (each ≤128 MiB) — flagged,
not needed for chonk.

---

## 2. Lifetime zones & the exact overlay map

Zones: **IN** (scalars, per-MSM) · **RED** (`redBuf`/`isPresent` accumulator) ·
**PASS-scatter** + **PASS-csr** (per-pass) · **GRID** (planner/sort, full-NW
today) · **THREAD** (`sT·sS`-scaled) · **REDUCE** (`reducePrefScratch`). Overlay
= share arena bytes between buffers with disjoint `[first-touch, last-read]`
dispatch intervals. Intervals are **exact from the dispatch trace**
(`encodeIntoBatch`, `msm_v2.ts:2592-2833`); `clearBuffer` counts as a write.

### Dominant overlay: scatter → ptScratch (reclaims ~30 MiB)

| buffer | live interval | bytes @sT=8192 |
|---|---|---|
| `bucketAndSign` | [0, 5] | 10.0 MiB |
| `valIdx` | [4, 5] | 10.0 MiB |
| `l0Idx` | [1, 31] | 10.0 MiB |
| **scatter free after disp 31** | | **30 MiB** |
| `ptScratch` | **[33, 85]** | 32.0 MiB |

`31 < 33` ⇒ disjoint. The 30 MiB scatter region hosts the 32 MiB `ptScratch`
(net `ptScratch` cost ≈ 2 MiB). This single overlay is why the arena is far below
the naive sum, and it is provable, not heuristic.

### Always-live — exclude from overlay
`redBuf`,`isPresent`: **[22, end]** (accumulation + reduce). Long tails into the
17-level pt loop: `activeCount`[27,85], `binOffsets`[29,85],
`sortedActiveBuckets`[30,85], `ptOff`[32,85] — overlay only with buffers dead
before their first-write.

### Short disjoint scratch — collapse to one shared slot (all tiny, sT-independent)
`valIdx`[4,5] · `wgCuts`[19,20] · `threadCuts`[20,21] · `cumulativeAdds`[18,21] ·
`partialWritePos`[26,26] · `countHistogram`[28,29] · `binWritePos`[29,30]. These
are pairwise/chain-disjoint.

### Clears that MUST move (correctness)
Pre-batch `clearBuffer` of `walkerPartials`,`taskCuts`,`threadCuts`,`redBuf`,
`isPresent`,`bucketHead`,`walkerNodeCounter`,`ptTotalTasks` (`msm_v2.ts:2639-2656`)
and per-batch clears of `streamPlannerMeta`,`cumulativeAdds`,`partialCount`,
`partialWritePos`,`activeCount`,`countHistogram`,`walkerPartialDest`
(`msm_v2.ts:2680-2704`) establish a write at "pre-dispatch". **A shared overlay
slot may only be cleared for its current occupant** — relocate each clear into
its occupant's scope or it will zero the co-tenant.

### Confirmed (closed — no longer uncertain)
- `walkerPartials` is one buffer = persisted partials region + an intra-dispatch
  pref tail at `pref_off=4·M_partials`; treat the whole buffer live **[23, 33]**.
- `streamPlannerMeta` doubles as the **INDIRECT dispatch-args** source for
  dispatches 22 & 23 — respect those indirect reads (not just shader reads).
- **`bucketHead`, `walkerNodesSlot`, `walkerNodesNext`, `walkerNodeCounter` are
  DEAD (~1.33 MiB).** Assigned to locals at `msm_v2.ts:2405-2408` but never put
  in any `mkBind` (audited `:2420-2479`) — the Task #19 linked-list combine was
  superseded by the sort-based combine. **Drop them.**
- **`ptMeta` (16 B) is bound to `ptInitScan` (write, `:2470`) but never read.**
  Keep the 16-B slot (the bind layout requires it); it carries no live data, so
  it overlays freely. Not worth removing.

---

## 3. Sizing model (exact)

### Constants (from source)
| symbol | value | source |
|---|---|---|
| `NUMBITS` | 254 | `msm_v2.ts:40` |
| `PG` | 2 | `msm_v2.ts:37` |
| `PLANNER_TPB` | 256 | `msm_v2.ts:38` |
| `STREAM_S` (`sS`) | 8 | `ba_stream_plan.ts:6` |
| `STREAM_WALKER_TPB` | 64 | `ba_stream_plan.ts:37` |
| `MAX_PLANNER_WORKGROUPS` | 32 | `ba_stream_plan.ts:34` |
| `STREAM_NUM_THREADS` (`sT`) | `= MPW·PLANNER_TPB = `**8192** | `ba_stream_plan.ts:36` |
| `sT·sS` | 65536 | |
| `soaSize(M)` | `2·PG·M·4·4 = `**64·M** B | `msm_v2.ts:771` |
| walker workgroups | `sT/64 = 128` | |

**`sT` is not a free knob** — it is `MAX_PLANNER_WORKGROUPS × 256`. The phone
lever is lowering `MAX_PLANNER_WORKGROUPS` (8→`sT`=2048; 4→`sT`=1024).

### Window geometry (exact; `c = pickC(round(log₂ n))`, `msm_v2.ts:401`)
`NW = ⌈254/c⌉`, `stride = 2^(c−1)`, `BW = ⌈(2^(c−1)+1)/256⌉·256`,
`bTotal = NW·BW`, `redM = NW·stride`.

| round(log₂n) | c | NW | stride | BW | bTotal | redM |
|---|---|---|---|---|---|---|
| 14 | 8 | 32 | 128 | 256 | 8 192 | 4 096 |
| 15 | 10 | 26 | 512 | 768 | 19 968 | 13 312 |
| 16–17 | 13 | 20 | 4 096 | 4 352 | 87 040 | 81 920 |
| 18–20 | 15 | 17 | 16 384 | 16 640 | 282 880 | 278 528 |

Chonk's 17 distinct N round to log₂∈{14,15,16,17} → c∈{8,10,13,13}.

### Per-buffer byte formulas (exact, `ensureScratch` `msm_v2.ts:766-1113`)
`bw = ⌈NW/numBatches⌉`; `numBatches` = smallest `nb` with `⌈bw·n/128⌉ < 65000`
(`wgFits`, `msm_v2.ts:2069`). **At logN17, `nb=1` (`bw=NW=20`).**

| zone | buffer | bytes | scales with |
|---|---|---|---|
| IN | `scalarsRaw` | `32·n` | n |
| RED (full NW) | `redBuf` | **`64·redM`** | NW |
| | `isPresent` | `4·redM` | NW |
| PASS-scatter | `bucketAndSign` | `4·bw·n` | bw·n |
| | `valIdx` | `4·bw·n` | bw·n |
| | `l0Idx` | `4·(bw·n+3)` | bw·n |
| PASS-csr | `counts[2]`+`offsets[2]` | `16·bw·BW` | bw·BW |
| | `rowPtr` | `4·bw·(BW+1)` | bw·BW |
| GRID (full NW) | `size1`(8·bTotal)+14 lists(4·bTotal) | **`64·bTotal`** | bTotal |
| | `radixHist` | `1024·sRadixTiles` | tiny |
| THREAD | `ptScratch` | **`512·sT·sS`** | sT |
| | `walkerPartials` | `160·sT·sS` | sT |
| | `ptTasks` | `32·sT·sS` | sT |
| | `walkerPartialDest` | `8·sT·sS` | sT |
| | `partialLayout` | `8·sT·sS` | sT |
| | `ptChunks` | `4·sT·sS` | sT |
| | `taskCuts` | `8·sT·(sS+1)` | sT |
| | `threadCuts`+`streamPlannerMeta` | `8·sT + 4·(20+sT)` | sT |
| REDUCE | `reducePrefScratch` | `32·NW·REDUCE_WG·⌈(stride/2)/REDUCE_WG⌉` | NW |
| DEAD (drop) | `walkerNodesSlot`/`Next` | `8·sT·sS` each | — |
| | `bucketHead` | `4·bTotal` | — |
| | ~14 legacy stubs | 4 each | — |

`REDUCE_WG = pickReduceWg(c) ∈ {32,64,128}` (`msm_v2.ts:433`). `MAXC = ⌈ppw/REDUCE_WG⌉`
maximised over reduce passes (`:2086`); the max `ppw` is `stride/2` (the `mm=1`
pass, `:1658`), so `MAXC = ⌈(stride/2)/REDUCE_WG⌉` and `reducePrefBytes =
32·NW·REDUCE_WG·MAXC` (`:2215`). c=13 → 16 → **1.25 MiB**; c=10 → 0.20; c=8 → 0.06.
Closed-form from `n`.

`l0Idx`'s `max()` (`:2170`,`:2182`) is pinned to the `batchSlots+3` branch — the
code throws if the transpose-partials matrix (`batchWindows·partialStride`) would
exceed it, so that branch always wins; `l0Idx = 4·(bw·n+3)` exactly.

### Exact footprint — logN=17 (n=131072, c=13, NW=20, nb=1, bw=20)

| buffer | sT=8192 (MiB) | sT=2048 (MiB) |
|---|---|---|
| scalarsRaw | 4.00 | 4.00 |
| bucketAndSign | 10.00 | 10.00 |
| valIdx | 10.00 | 10.00 |
| l0Idx | 10.00 | 10.00 |
| counts+offsets | 1.33 | 1.33 |
| rowPtr | 0.33 | 0.33 |
| redBuf | 5.00 | 5.00 |
| isPresent | 0.31 | 0.31 |
| GRID | 5.31 | 5.31 |
| **ptScratch** | **32.00** | **8.00** |
| walkerPartials | 10.00 | 2.50 |
| ptTasks | 2.00 | 0.50 |
| other THREAD | 1.90 | 0.50 |
| reducePref | 1.25 | 1.25 |
| **arena (live)** | **~93.4** | **~59.0** |
| **total (arena + SRS 8.0)** | **~101** | **~67** |

(`bucketHead`/`walkerNodes*` add ~1.33 MiB in the *current* code but are dead —
excluded here, dropped in the redesign. §2.) The `sT=8192` total (~101 MiB incl.
SRS) is confirmed against a device buffer-budget measurement at N=2¹⁷ (~a little
over 100 MB) — the byte model reproduces the real allocation.

The 160 MB cap is comfortable at chonk's max. At `sT=8192` the THREAD zone is
45.9 of the 93.4 MiB (`ptScratch` 32 alone). **With the §2 scatter→ptScratch
overlay, drop ~30 MiB** → ~63 MiB (sT=8192) / ~51 MiB (sT=2048). The cap becomes
binding only for wide packing or if `sT` stays 8192.

### The budget inequality the planner enforces
`SRS + IN + RED + GRID + PASS(bw,pack) + THREAD(sT) + REDUCE ≤ 160 MB`.
Phone priority of levers: **(1) `sT = MPW·256`** (THREAD −34 MiB, 8192→2048);
**(2) overlay** scatter→ptScratch (§2, −~`ptScratch`); **(3) stage** `bw=⌈NW/nb⌉`
(scatter & csr ∝ `bw`); **(4) pack-count** for small MSMs.

---

## 4. The offset table (`layout`)

Two levels: per-MSM (outer, packing) and per-window (inner, split-c). Storage
buffer (per-window arrays would waste uniform alignment):

```ts
struct MsmDesc {          // 32 B
  in_off:u32, out_off:u32, n:u32, num_windows:u32,
  sched_off:u32,          // index of this MSM's first WindowDesc
  n_large:u32,            // split-c upper-region scalar count (= n if no split)
  _pad0:u32, _pad1:u32,
}
struct WindowDesc {       // 16 B
  work_off:u32,           // window base in PASS working-bucket region
  reduce_off:u32,         // window base in the reduce/bucket-sum region
  window_bits:u32,        // c_w (uniform c when no split)
  bit_base:u32,           // Σ_{k<w} c_k (= w·c when no split)
}
// layout = [MsmDesc × num_msms] ++ [WindowDesc × Σ num_windows]
```

Kernel addressing replaces the compiled-in strides (`bid/BW`, `bid%BW`, and
`red_slot = w·STRIDE + (local−1)` — see `ba_walker_combine_filter.template.wgsl`):

```wgsl
let m  = layout_msm[msm_idx];
let wd = layout_win[m.sched_off + w];
let work_addr = PASS_WORK_BASE  + wd.work_off  + b;       // working bucket b
let rslot     = PASS_RED_BASE   + wd.reduce_off + (b - 1u);
```

**No-split = uniform fill** (`work_off[w]=w·BW`, `reduce_off[w]=w·STRIDE`,
`window_bits=c`, `bit_base=w·c`) — the same indexing runs both modes. That
identity is the whole point: split-c is a different table, nothing else.

---

## 5. Split-c integration

`VariableWindowSchedule` (CPU ref `scalar_multiplication.cpp:633`) precomputes the
inner table: `window_bits_per_window[w]`, `bit_base[w]`, `num_buckets[w]`.

1. **Decide the schedule** from a 256-bin MSB histogram (`choose_var_window_split`,
   `:721`) computed **host-side** from the zero-copy scalar view (cheap O(n), no
   round-trip). Fill `WindowDesc[]`: `work_off`/`reduce_off` are prefix sums of
   the variable `num_buckets[w]`, not `w·BW`/`w·STRIDE`.
2. **Two populations.** Lower windows iterate all `n`; upper windows iterate only
   `n_large`. Build `idx_large` (msb ≥ `b_star`) via a GPU stream-compaction;
   its size is known from the histogram, so the upper scatter (`n_large·W_hi`)
   stays deterministic. Total scatter `= 4·(n·W_lo + n_large·W_hi)·(3 buffers)` —
   **smaller** than uniform, never larger.
3. **Variable-c decode** in `decompose`: read `wd.window_bits`/`wd.bit_base`.
4. **Reduction/walker** iterate `num_buckets[w]` per window.

**Sizing stays bounded:** the CPU sizer uses the unsplit `num_buckets` as the
conservative B_eff bound *before* the split (`scalar_multiplication.cpp:2525`).
Size the arena to the **unsplit** envelope (§3 tables); split only redistributes
within it. **Make the split decision budget-aware** — reject any schedule whose
arena bytes (a pure function of the table) exceed 160 MB.

Kernels touched (constant stride → `layout_win` lookup, same arithmetic):
`decompose`, `classify`, `csr_to_v2_meta`, `stream_walker`, all `combine`/`sort`,
`pt_finalize`, `reduce-level`. The reduction *algorithm* is untouched.

---

## 6. Packing multiple MSMs

IN and OUT concatenate per MSM (`MsmDesc.in_off`/`out_off`). PASS and THREAD are
**shared**: one walker dispatch over all packed MSMs, decoding `(msm,window,bucket)`
from a per-pass work-tile table. Group by size class (homogeneous → simple 2-D
`(msm,point)` grid); flatten only when forced to mix sizes.

**Unified scheduler.** A *work-tile* = `(msm_idx, window_range)`. A small MSM is
one tile; a large MSM is several (`bw`-window subsets). Bin-pack tiles into
budget-sized passes — packing small MSMs and staging a large one are the same
operation. One pass = one arena fill = one dispatch = one submit; OUT read back
once per batch.

**Residency constraint:** a large MSM's IN scalars persist across all its passes.
Process its tiles consecutively and close it before opening the next large MSM,
else two big IN blocks co-reside. Small MSMs (single tile) pack freely.

---

## 7. Migration from `SharedScratch`

| Current buffer(s) | Arena destination |
|---|---|
| `poolX`,`poolY` | **SRS** (outside arena) |
| `scalarsRawBuf` | IN |
| `bucketAndSignBuf`,`valIdxBuf`,`l0IdxBuf` | PASS-scatter (overlays `ptScratch`, §2) |
| `countsBufs[2]`,`offsetsBufs[2]`,`rowPtrBuf` | PASS-csr |
| dense/sorted/active lists, `partialOffset`,`ptOff`,`ptCount`,`ptBucketWg`,`ptWgBucketList`,`size1BucketList`,`cumulativeAdds`,`radixHist` | GRID |
| `redBuf`,`isPresentBuf` | RED — **see restructure** |
| `walkerPartials`,`walkerPartialDest`,`partialLayout`,`taskCuts`,`threadCuts` | THREAD |
| `ptScratch`,`ptTasks`,`ptChunks`,`ptWg*` | THREAD |
| `streamPlannerMeta`, indirect-args (`pt*DispatchArgs`,`cbDispatchArgs`) | small fixed region at arena head (INDIRECT usage) |
| `reducePrefScratch` | REDUCE |
| ~14 dead 4-B stubs + `bucketHead`/`walkerNodesSlot`/`walkerNodesNext`/`walkerNodeCounter` (confirmed unwired, `:2405-2408` never bound) | **delete (~1.33 MiB)** |

**Reduce restructure (the one compute-flow change).** Today `redBuf` is
`64·redM` (all NW windows) and `reduce-level` runs at the end. To make bucket
storage per-pass, each pass reduces its `bw` windows' buckets to `bw` points
immediately and accumulates into a persistent `windowSums[NW]` (the `S_w`). This
matches the existing `combineOnHost=true` flow (already reads back per-window
points and Horner-combines on host); host readback becomes `NW·64` B regardless
of `n`. RED storage drops from `64·NW·stride` to `64·bw·stride`.

**Wire the budget gate.** Replace the `wgFits`-only loop (`msm_v2.ts:2071`) with:
pick the largest `bw` (and pack-count) satisfying §3's inequality at 160 MB
**including the THREAD terms `estimateMem` omits**, with `wgFits` as a second
constraint.

---

## 8. `sT` is the phone lever (exact)

THREAD bytes `= (512+160+32+8+8+4)·sT·sS + 8·sT·(sS+1) + 8·sT + 4·(20+sT)`
`= 724·sT·sS + O(sT)`. At `sS=8`:

| `sT` (`MPW`) | THREAD | `ptScratch` |
|---|---|---|
| 8192 (32) | 45.9 MiB | 32.0 MiB |
| 2048 (8) | 11.5 MiB | 8.0 MiB |
| 1024 (4) | 5.7 MiB | 4.0 MiB |

`ptScratch` (`512·sT·sS`) is ~70 % of it. THREAD does **not** shrink with
window-staging — only with `sT = MAX_PLANNER_WORKGROUPS·256`
(`ba_stream_plan.ts:34-36`). A phone GPU (Mali-G715 ~7 cores; Adreno) is
oversubscribed at `sT=8192` (128 walker workgroups), so `MPW=8 → sT=2048` likely
costs little and reclaims ~34 MiB. Also check `STREAM_WALKER_TPB=64` against the
phone's `maxComputeWorkgroupStorageSize` (needs `2·64·8·16 = 16 KiB`; some phones
cap at 16 KiB). Make `MPW` (hence `sT`) device-adaptive.

---

## Build order (lowest risk first)

1. **Consolidate `SharedScratch` → co-binding-partitioned arenas.** Build the
   co-binding conflict graph from the 37 bind groups, graph-colour it, and carve
   each colour's buffers from one arena (256-B slots) via the polymorphic
   `mkBind`. ✅ done: dead set dropped (`28c3babb5b`); `mkBind` accepts
   `GPUBuffer | GPUBufferBinding` + `ptScratch` migrated, byte-identical
   (`97190e5af7`). Next: colour the graph, migrate each colour, validate each.
2. **`sT` device-adaptive** (`MPW`). Bench phone — confirm `sT=2048` holds perf.
3. **Reduce restructure** → per-pass RED + persistent `windowSums`; wire the
   160 MB gate (incl. THREAD terms); enable `bw` staging.
4. **Overlay** scatter→`ptScratch` + the short-disjoint slot (§2), with clears
   relocated into per-occupant scope. Validate output unchanged.
5. **Packing** (work-tile scheduler, shared PASS/THREAD). Validate profiles A–E.
6. **Split-c**: `VariableWindowSchedule`-derived `WindowDesc[]` + `idx_large`
   compaction + budget-aware decision. Arena unchanged.
