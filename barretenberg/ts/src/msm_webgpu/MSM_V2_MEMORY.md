# MsmV2 peak-GPU-memory map (stream-walker-impl lineage)

Authoritative buffer-by-buffer accounting of the per-MSM scratch the
`MsmV2Pool` allocates, plus the `numBatches` memory-budget lever. All numbers
are computed directly from the `ensureScratch` sizing formulas (deterministic;
no GPU needed — `statsBytes()` is a pure sum of `GPUBuffer.size`).

## Premise correction

On this lineage the **pair-tree V2 was deleted** ("Phase 5 cutover") and its
buffers — `bufA`, `bufB`, `pairBlockPlanRing`, `scatterPlanRing`,
`carryPlanRing`, `prefScratchBuf`, and the legacy stream-accum buffers — were
shrunk to **4-byte stubs** ("§14 step 9"). MsmV2 now runs the streaming
**walker**. So the historically "dominant" pair-tree buffers are already gone;
they are *not* where the memory is anymore. Do not spend effort shrinking them.

## Where the memory actually is

Dominant **live** scratch buffers, sized either `batchWindows·n` (CSR planes,
shrink with `numBatches`) or fixed (`bTotal`, `redM`, `n`, walker working set):

| Buffer | Size formula | logn=17 | logn=20 | batch-dependent? |
|---|---|---:|---:|:--:|
| `l0IdxBuf` | `(batchWindows·n+3)·4` | 10.0 MB | 24.0 MB | yes |
| `bucketAndSignBuf` | `batchWindows·n·4` | 10.0 MB | 24.0 MB | yes |
| `valIdxBuf` | `batchWindows·n·4` | 10.0 MB | 24.0 MB | yes |
| `walkerPartials` | `64·(2·STREAM_T·STREAM_S)` | 8.0 MB | 8.0 MB | no |
| `bucketResultBuf` | `64·bTotal` | 5.3 MB | 17.3 MB | no |
| `redBuf` | `64·redM` | 5.0 MB | 17.0 MB | no |
| `scalarsRawBuf` | `n·32` | 4.0 MB | 32.0 MB | no |
| (counts/offsets/rowPtr) | `∝ batchWindows·BW` | 1.6 MB | 1.9 MB | yes |
| (lists/dest/slots/etc.) | `∝ bTotal`, `STREAM_T·S` | ~3 MB | ~5 MB | no |
| **per-MSM scratch total** | | **~59 MB** | **~160 MB** | |
| pool SRS (`poolX`+`poolY`) | `n·32·2` | 8.0 MB | 64.0 MB | no (shared) |
| **TOTAL** | | **~67 MB** | **~224 MB** | |

`numBatches` is forced up by `wgFits` (workgroup-count limit) to 1 @logn=17 and
3 @logn=20 by default.

## The `numBatches` memory-budget lever (`MsmConfig.memBudgetBytes`)

The whole pipeline already loops `for bi in 0..numBatches`, each batch handling
a disjoint window range and writing a disjoint slice of the full-`bTotal`
`bucketResultBuf`; the reduction runs once over the whole buffer afterward.
Raising `numBatches` therefore shrinks every `batchWindows·n` buffer with **no
correctness change** — it is the same multi-batch path that is already the
default at logn=20. `estimateMem(nb)` (the previously-dead "lever G") is now
wired into the `numBatches` loop: batches are added until the batch-dependent
scratch fits `memBudgetBytes` (default `MEM_BUDGET` = 248 MB, a no-op for
n ≤ 2^20). Peak per-MSM scratch vs budget (deterministic):

```
logn=17:  248MB→nb=1 57.2MB | 48MB→nb=2 41.4MB | 32MB→nb=5 31.9MB | floor nb=20 27.2MB
logn=20:  248MB→nb=3 154MB  | ≤100MB→nb=17 92.5MB (floor)
```

So the lever cuts peak scratch ~28 % @logn=17 (nb=2) and ~40 % @logn=20 (full
batching, 154→92.5 MB; total 218→156 MB). The **cost is more sub-passes
(time)** — that trade is the on-hardware measurement.

## What the lever cannot do

The fixed floor (`scalarsRawBuf` + `bucketResultBuf` + `redBuf` +
`walkerPartials` + lists) is ~92 MB @logn=20, and pool SRS is another 64 MB.
Hitting the ≤100 MB-to-2^20 goal needs attacking those too — SRS point
compression (store x + a y-sign bit, decompress on GPU via the existing
`decompress_g1_bn254` shader: 64→32 MB), and streaming `scalarsRawBuf`
(32 MB) per batch. Those are the next memory levers; they are *not* the
pair-tree buffers.
