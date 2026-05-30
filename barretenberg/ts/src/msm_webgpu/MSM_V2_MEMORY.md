# MsmV2 peak-GPU-memory map (stream-walker-impl lineage)

Buffer-by-buffer accounting of the per-MSM scratch `MsmV2Pool` allocates, plus
the `numBatches` memory-budget lever and its measured time cost. All sizes are
**deterministic** — `MsmV2Pool.statsBytes()` is a pure sum of `GPUBuffer.size`,
and every size is a closed form of `(n, c, numBatches)` fixed at `prepare()`.
Regenerate the numbers below with, and audit against,
[`scripts/mem-accounting.mjs`](../../dev/msm-webgpu/scripts/mem-accounting.mjs)
(`node dev/msm-webgpu/scripts/mem-accounting.mjs 16 17 18 20`) — no GPU needed.

## Premise correction

On this lineage the **pair-tree V2 was deleted** ("Phase 5 cutover") and its
buffers — `bufA`, `bufB`, `pairBlockPlanRing`, `scatterPlanRing`,
`carryPlanRing`, `prefScratchBuf`, and the legacy stream-accum buffers — were
shrunk to **4-byte stubs** ("§14 step 9"). MsmV2 now runs the streaming
**walker**. The historically "dominant" pair-tree buffers are already gone; do
not spend effort shrinking them. The `OVERSIZE_FACTOR` (1.3×) padding now
inflates only those stubs and the reduce `capMAXC`, so it costs no real memory.

## Where the memory actually is (deterministic, script-verified)

Per-MSM scratch + shared SRS pool, at the default `numBatches` (`wgFits` forces
nb=1 up to logn≈17 and nb=3 @logn20). Buffers ≥1 MB at logn20:

| Buffer | Size formula | logn17 | logn20 | shrinks with nb? |
|---|---|---:|---:|:--:|
| `scalarsRawBuf` | `n·32` | 4.0 | **32.0** | no |
| `l0IdxBuf` | `(batchWindows·n+3)·4` | 10.0 | 24.0 | yes |
| `bucketAndSignBuf` | `batchWindows·n·4` | 10.0 | 24.0 | yes |
| `valIdxBuf` | `batchWindows·n·4` | 10.0 | 24.0 | yes |
| `bucketResultBuf` | `64·bTotal` | 5.3 | 17.3 | no |
| `redBuf` | `64·redM` | 5.0 | 17.0 | no |
| `walkerPartials` | `64·(2·STREAM_T·STREAM_S)` | 8.0 | 8.0 | no |
| `reducePrefScratch` | `numWindows·reduceWg·capMAXC·2·16` | 1.6 | 5.6 | no |
| size1/dense/sorted/cumul/bucketHead lists | `∝ bTotal` | 1.9 | 7.8 | no |
| counts/offsets/rowPtr | `∝ batchWindows·BW` | 2.1 | 2.0 | yes |
| walker dest/nodes/taskCuts | `∝ STREAM_T·STREAM_S` | 2.2 | 2.2 | no |
| **per-MSM scratch total** | | **60.8** | **165.7** | |
| pool SRS (`poolX`+`poolY`) | `n·32·2` | 8.0 | 64.0 | no (shared) |
| **TOTAL** | | **68.8** | **229.7** | |

### Correction vs the prior table

The first revision of this map **omitted `reducePrefScratch`** (~5.6 MB @logn20)
and **undercounted the bucket lists**, and so overstated how far the lever
reaches. Real, script-checked numbers:

- @logn20 total is **~230 MB**, scratch **~166 MB** (prior table said 224 / 160).
- `scalarsRawBuf` (`n·32` = 32 MB @logn20) is the **single largest** scratch
  buffer and is **not** batch-dependent — every batch's `decompose` reads the
  full scalar set, so the lever cannot shrink it.

## The `numBatches` budget lever (`MsmConfig.memBudgetBytes`)

The pipeline loops `for bi in 0..numBatches`, each batch covering a disjoint
window range, writing a disjoint slice of the full-`bTotal` `bucketResultBuf`;
the reduction runs once over the whole buffer afterward. Raising `numBatches`
shrinks every `batchWindows·n` buffer (the three CSR index planes + counts /
offsets / rowPtr) with **no correctness change** — it is the same multi-batch
path already default at logn20. `estimateMem(nb)` is wired into the selection
loop; batches are added until the batch-dependent scratch fits
`memBudgetBytes` (default `MEM_BUDGET` = 248 MB, a no-op for n ≤ 2^20).

Scratch / total MB across the lever's efficient frontier (from the script):

```
logn17:  nb1 60.8/68.8 | nb2 45.0/53.0 | nb3 40.2/48.2 | nb5 35.5/43.5 | nb20 30.7/38.7 (floor)
logn20:  nb3 165.7/229.7 | nb5 141.1/205.1 | nb6 128.8/192.8 | nb9 116.5/180.5 | nb17 104.1/168.1 (floor)
```

### What the lever cannot reach

Even **fully batched**, the fixed floor @logn20 is **~104 MB scratch + 64 MB
SRS = ~168 MB total** — `scalarsRaw` 32 + `bucketResult` 17 + `redBuf` 17 +
`walkerPartials` 8 + `reducePref` 5.6 + lists ~8 + SRS 64. The ≤100 MB-to-2^20
goal is therefore **unreachable by batching alone** (the prior table's "92.5/156
floor" was the undercount). Closing the rest needs the WGSL-level levers, each a
separate piece of work with its own time trade:

- **SRS x-only + on-GPU y-recovery** (`decompress_g1_bn254`): poolY 32→0 MB
  @logn20. Memory/time trade (adds a field sqrt per point gather).
- **In-place bucket reduction** (drop `redBuf`, reduce within `bucketResult`):
  −17 MB, but the reduce shaders must read+write the bucket layout.
- **Per-batch scalar byte-slicing** (`decompose` reads only the byte range its
  windows cover): cuts `scalarsRaw` residency, changes decompose indexing.

These are deliberately **out of scope** for this host-buffer-management PR
(every one needs a verified WGSL change); flagged so "≤100 MB" is not mistaken
for "done".

## The lever is a memory/TIME trade, not a free cut — MEASURED

`decompose` re-reads the **full `n`-scalar set every batch** and the planner
replays per batch, and the walker is memory-bandwidth-bound on real hardware,
so each extra batch adds roughly a full pass of scalar + index traffic. The
budget default is a **no-op** precisely so the common path pays no extra passes.

Measured via the `msm-membudget-sweep` autorun (logn16, median of 5 GPU-wall
runs per budget) on two real devices:

**Apple — BrowserStack macOS Sequoia · Chrome 148 · 8 cores** (GPU result
cross-checked vs `@noble/curves` at nb=1 — **passed**):

| budget | numBatches | peak (pool `statsBytes`) | GPU wall | Δ time |
|---:|:--:|---:|---:|---:|
| none | 1 | 47.4 MB | 50.7 ms | baseline |
| 40 MB | 2 | 39.1 MB | 60.1 ms | **+18.5 %** |
| 31 MB | 3 | 36.6 MB | 64.7 ms | +27.6 % |
| 29 MB | 4 | 34.9 MB | 77.9 ms | +53.6 % |
| 27 MB | 5 | 34.1 MB | 90.0 ms | **+77.5 %** |

**Android — BrowserStack Galaxy S25 Ultra · Android 15 · Chrome** (Snapdragon
8 Elite / Adreno; budget→nb differs because this run used the tightened
`estimateMem`):

| budget | numBatches | peak | GPU wall | Δ time |
|---:|:--:|---:|---:|---:|
| none | 1 | 47.4 MB | 278.9 ms | baseline |
| 40 MB | 2 | 39.1 MB | 283.5 ms | +1.6 % |
| 33 MB | 3 | 36.6 MB | 301.8 ms | +8.2 % |
| 31 MB | 4 | 34.9 MB | 327.1 ms | +17.3 % |
| 29 MB | 5 | 34.1 MB | 352.6 ms | +26.4 % |
| 27 MB | 10 | 32.4 MB | 462.9 ms | **+66.0 %** |

Both devices show the same shape — **peak memory falls monotonically, GPU wall
rises monotonically and accelerating, with badly diminishing returns past
nb≈2–3**. Even if it were correct, raising the **default** budget would regress
the common path materially, so the no-op default is right. But it is **not**
correct: see the critical finding below — `nb>1` returns the wrong MSM, so these
timings are the cost of a path that does not yet produce the right answer.

**Conclusion: the host-buffer-management memory lever is exhausted *and* the one
mechanism it drives (batching) is currently broken.** There is no free
over-provisioning to reclaim (every live buffer is algorithm-necessary and
tightly sized; the dead pair-tree buffers are already 4-byte stubs); the only
host-level cut is batching, which is both a steep time trade *and* presently
incorrect for nb>1. A real, safe peak-memory reduction therefore needs (a) the
multi-batch correctness bug fixed, and/or (b) the WGSL-level levers above
(in-place reduction, on-GPU SRS y-recovery, per-batch scalar slicing) — each a
separate verified change.

## ⚠️ Critical finding: the multi-batch path (`numBatches > 1`) is incorrect

The per-nb cross-check (every budget verified vs `@noble/curves`, **real macOS
Sequoia · Chrome 148**, logn16) shows the batched path returns **wrong** results:

| numBatches | GPU wall | matches noble? |
|:--:|---:|:--:|
| 1 | 50.6 ms | ✅ **yes** |
| 2 | 60.2 ms | ❌ no |
| 3 | 64.7 ms | ❌ no |
| 4 | 77.8 ms | ❌ no |
| 5 | 89.3 ms | ❌ no |
| 10 | 159.8 ms | ❌ no |

So nb=1 is correct and **every** `nb>1` disagrees — on hardware with a known-good
WebGPU implementation. This **refutes the premise** that raising `numBatches` is
"no correctness change … the same path already default at logn20." The budget
lever therefore does **not** safely trade memory for time today: engaging it
returns an incorrect MSM.

**Root cause (pinned):** `decompose_scalars_booth` applies the per-batch global
window base **only to the scalar-bit read** — `w_global = w + batch.x`,
`read_bits(p, …, w_global * c, c)` — but writes its output **local-window
indexed**: `idx = w * input_size + p` (`w` ∈ `[0, batchWindows)`). Every batch
therefore produces a CSR in the *same* local `[0, batchBuckets)` space, and the
shaders that finally write the full-`bTotal` `bucketResult` (`ba_size1`,
`ba_stream_walker`, `ba_walker_combine`) never re-apply a
`batch_window_base * BW` offset — their bind groups/params are built once in
`prepare()` and not updated per batch. So at nb>1 each batch **overwrites the low
`batchBuckets` region** of `bucketResult` instead of filling its disjoint slice;
windows above `batchWindows` stay zero, and the once-over `reduce` sums a buffer
where only the last batch's windows are populated. At nb=1
`batchBuckets == bTotal`, local == global, and it works. Fix direction: thread a
per-batch `bucket_base = batch_window_base * BW` into the three `bucketResult`-
writing kernels' destination index (and verify the `batchBuckets`-sized CSR
`counts`/`offsets` vs the `bTotal`-sized lists are indexed consistently).

**Blast radius beyond the lever:** the same multi-batch code is the
`wgFits`-forced **default** at **logn19 (nb=2)** and **logn20 (nb=3)** — so
MsmV2 is very likely **incorrect by default at logn≥19** (these sizes were never
cross-checked because the noble reference is too slow there). This needs direct
verification and a fix before MsmV2 is trusted at 2^19–2^20. It is distinct from,
and more serious than, the *invisible* bucket-0 issue noted in PR #23741.

### Android note

The Android Galaxy S25 Ultra run additionally showed **nb=1 disagreeing** with
noble (the GPU-decompressed SRS self-verified OK, so the bases match — the
discrepancy is in the Adreno MSM compute). That is a separate, **pre-existing
MsmV2-on-Adreno** issue independent of batching and of this PR's buffer sizing.
Android wall timings above are valid, but Android results are not
correctness-validated.

(Reproduce: `node dev/msm-webgpu/scripts/run-browserstack.mjs --target macos
--n 16 --autorun msm-membudget-sweep`, or drive a BS worker at
`index.html?autorun=msm-membudget-sweep&logn=16`.)
