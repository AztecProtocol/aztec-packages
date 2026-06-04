# CPU vs GPU per-MSM crossover — ECDSA-r1 transfer ChonkApi prove

Apple M4 Pro / Metal. Every `commit` / `batchCommit` MSM in the prove was timed
**twice**: once solo on the native multi-threaded Pippenger (`webgpu off`), once
solo through the WebGPU bridge (`webgpu on`, threshold lowered so **every** MSM
routes). 491 MSMs, joined 1:1 by a unique `<label>#<seq>` (seq reset per pass, same
deterministic commit order ⇒ same label both runs). Raw data: `msm-cpu-vs-gpu.csv`.

## How it was measured

- C++ `scalar_multiplication.cpp` csv-mode block: each MSM run solo, timed
  end-to-end, emits `[msm-csv-cpu] name=L#s n=N cpu_ms=…` (native) or
  `[msm-csv-gpu] … gpu_ms=…` (bridge round-trip: SAB hop + prepare + dispatch +
  mapAsync readback + Horner combine — the real production per-MSM GPU cost).
- `bb_set_webgpu_batch_delegate(1, 1)` in csv mode so the hook delegates every
  MSM (n ≥ 1). 26 tiny MSMs (n ≤ 118) failed to route (MsmV2 minimum size) and are
  reported `gpu-missing`; they are CPU-wins regardless. 21 n=0 no-ops excluded.

## Headline

| routing strategy | total MSM time |
|---|---|
| **all-CPU** (today, with the WebGPU hook off) | **3663 ms** (491 MSMs) |
| **all-GPU** (route everything, warm) | **4871 ms** — *worse than all-CPU* |
| **oracle** (each MSM on its faster engine) | **2181 ms** — only **80 MSMs (16%)** route to GPU |

Routing *everything* to the GPU is **33% slower** than leaving it all on CPU. The
win is real (3663 → 2181 ms, **−40%**) but only if you route the **right** 16%.

## The crossover is CPU work, NOT n

The native Pippenger cost tracks the **number of non-zero scalars** (it skips
zeros); the GPU is dense `O(n)` (it processes all n points). So the **same n** goes
opposite ways depending on polynomial density:

```
label                              n        cpu_ms   gpu_ms(warm)  winner
ORDERED_RANGE_CONSTRAINTS_0    131071        7          25         CPU   (sparse)
Z_PERM                         131071      138          48         GPU   (dense)
CONCATENATED_RANGE_CONSTRAINTS 131071        7          29         CPU   (sparse)
SHPLONK_BATCHED_QUOTIENT       131072      127          54         GPU   (dense)
W_4 (sparse vk poly)            43314        5          30         CPU
Z_PERM                          43314       53          42         GPU
```

Range-constraint / lookup / shifted polynomials are **sparse** — large n, few
non-zeros — and lose on the GPU even at n=131071. Wire / permutation / quotient
polynomials are **dense** and win above ~n=16k.

### Win-rate by CPU cost (the actual predictor)

```
cpu band (ms)   count   gpu-wins   win%
        0–5      331        0        0%
        5–10      26        3       12%
       10–15      11        5       45%
       15–20      12        8       67%
       20–30      18       18      100%
       30–50      31       31      100%
        50+       15       15      100%
```

**Clean crossover at cpu ≈ 15–20 ms.** Below ~15 ms of CPU work the GPU never wins;
above ~20 ms it always wins. n is a poor proxy — density is the signal.

## The GPU per-MSM floor ≈ 4–17 ms

The minimum warm GPU time is **4 ms**, and most small MSMs sit at 8–17 ms regardless
of n. That floor is the **synchronous-bridge round-trip** (SAB wake + `prepare` +
submit + `mapAsync` readback + combine), paid once per MSM. The GPU cannot beat any
MSM whose CPU cost is below this floor — which is why all 331 sub-5 ms MSMs are CPU
wins, and why all-GPU loses to all-CPU.

## Cold-start: first MSM of each (n, c) pays ~150–290 ms

The first time each size is seen, the GPU compiles its pipeline variants:

```
W_L#0              n=88899   gpu=293 ms   (next same-size W_R#1 = 25 ms)
LOOKUP_READ_COUNTS#17  n=36863   gpu=144 ms   (LOOKUP_READ_TAGS#18 = 20 ms)
```

One-time per size; amortizes across a multi-prove session. The "warm" GPU numbers
above strip it (per-n minimum).

## Per-n summary (warm)

```
       n  cnt | cpu_med | gpu_warm | winner          n  cnt | cpu_med | gpu_warm | winner
       1   25 |   0.00  |    9.00  | CPU          16384    2 |  23.00  |   19.00  | GPU
       4   72 |   0.00  |    9.00  | CPU          20406    5 |  16.00  |   14.00  | GPU
     298   13 |   2.00  |    7.00  | CPU          32768    2 |  36.50  |   21.00  | GPU
     871   25 |   0.00  |    5.00  | CPU          43315    7 |  31.00  |   15.00  | GPU
    3192   24 |   0.00  |    4.00  | CPU          65536    2 |  58.00  |   47.00  | GPU
    8192    8 |  11.00  |   13.00  | CPU          71364   15 |  38.00  |   23.00  | GPU
   12368    3 |   1.00  |   10.00  | CPU          88900    2 |  89.00  |   50.00  | GPU
   36863*   3 |   1.00  |   20.00  | CPU(sparse) 131072    3 | 131.00  |   54.00  | GPU
  131071*  11 |   9.00  |   25.00  | CPU(sparse) 131072* dense Z_PERM/SHPLONK → GPU
```
`*` = the same n appears as both sparse (range/lookup → CPU) and dense
(perm/quotient → GPU); the row shows the sparse majority.

## Conclusion / what to do with it

1. **Delegate by estimated CPU cost (density), not by n.** Route an MSM to the GPU
   iff its expected native cost ≳ 20 ms — i.e. **dense AND n ≳ 16k**. A cheap
   non-zero-scalar count (or a density hint from the prover, which already knows
   range-constraint/shifted polys are sparse) is the right gate. The current
   `n ≥ threshold` gate (and the `#4` `small=512` experiment) mis-routes sparse
   large-n polynomials to the GPU, where they lose.

2. **The ceiling on this flow is the −40% oracle (3663 → 2181 ms of MSM time).**
   80 dense MSMs carry it; the other 411 belong on CPU.

3. **The ~4–17 ms GPU floor is per-MSM and synchronous** — this is the *solo*
   number. Production batches via the union, which amortizes the floor across a
   pack, so batched small MSMs do better than this solo data shows (that is exactly
   what `#4` exploits). The crossover above is therefore a *lower bound* on GPU
   benefit for MSMs that batch together; for MSMs issued alone it is the real line.

4. **Cold-start (~150–290 ms first-touch per size) is separate** and amortizes; it
   is the largest single per-prove GPU tax on a cold first prove.
