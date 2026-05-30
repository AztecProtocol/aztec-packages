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

## The lever is a memory/TIME trade, not a free cut

`decompose` re-reads the **full `n`-scalar set every batch**, and the walker is
memory-bandwidth-bound on real hardware, so each extra batch adds roughly a
full pass of scalar + index traffic. The budget default is a **no-op** precisely
so the common path pays no extra passes. The measured trade (GPU wall ms vs
`numBatches`, real hardware, via the `msm-membudget-sweep` autorun) is filled in
below once a BrowserStack seat is available.

<!-- TIME-TRADE: pending real-hardware sweep -->
