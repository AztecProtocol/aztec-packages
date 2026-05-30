# Hybrid stream-walker MSM accumulator

A memory- and time-efficient BN254 WebGPU MSM accumulator for laptop and mobile
GPUs (Apple TBDR, Qualcomm Adreno, ARM Mali). It keeps the stream-walker's low
memory footprint while recovering the occupancy that made the V2 pair-tree fast,
under the constraints: total memory ≤ 100 MB to n = 2²⁰, and (originally)
workgroup-shared memory ≤ 16 KB on Mali Bifrost.

## 1. Starting point: two accumulators on the Pareto extremes

| Accumulator | Accumulation buffers @2¹⁷ | Time @2¹⁷ | Where it sits |
|---|---:|---|---|
| **V2 pair-tree** | ~62 MB | fast | time-good, memory-bad |
| **stream-walker** | ~9–13 MB | ~25% slower overall | memory-good, time-bad |

The stream-walker is a per-thread, bucket-monotonic walker: each of
`NUM_THREADS` threads owns a contiguous slice of the sorted bucket stream,
splits it into `S` equal-work tasks, and runs `S` pair-pointer slots through
**one field inversion per S adds** (Montgomery batched inversion). Its inner
loop is forward-prefix → one inversion → inverse-pass → backward-peel.

## 2. The bottleneck is occupancy, not arithmetic and not raw traffic

The slowness is **not** the inversion math, and (measured) not raw point-read
bandwidth either. It is **occupancy** — the GPU cannot hide the long per-thread
serial dependency chain (S muls → 1 inversion → S muls → S affine adds) because
too few workgroups are resident.

Two things capped occupancy in the original walker:

1. **Workgroup-shared `pref_scratch`.** Declared
   `var<workgroup> array<vec4<u32>, TPB*S*2>` — 16 KB at TPB=64, S=8. It is
   *per-thread with no cross-thread sharing* (the loop has no `workgroupBarrier`),
   so it lives in workgroup memory only to keep registers down. That 16 KB caps
   resident workgroups to ~2 on Apple (32 KB shared) and ~1 on Mali Bifrost.
2. **Per-thread register pressure.** `acc_x`/`acc_y` (16·S u32), the prefix
   scratch, `dx_cache`, and the control arrays. The more live registers, the
   fewer resident warps.

These two interact: the design lever is to **minimise per-thread footprint**, by
*both* axes, so more workgroups stay resident and the latency of the serial
chain is hidden.

## 3. What was measured (Apple M2, Chrome 148, logn=17, S=8, reps=8)

All numbers are the `stream_walker` GPU phase (the dominant phase; the full MSM
also has preprocess ≈3.4, walker_combine ≈6, reduce ≈8.5 ms, stable across
variants). Each ladder ran in **one** BrowserStack session, so the comparison is
free of cross-session clock/thermal noise.

| variant | stream_walker (ms) | GPU total (ms) | Δ walker |
|---|--:|--:|--:|
| baseline: 3-pass, dx-cache, **workgroup** pref, TPB 64 | 66.8 | 85.3 | — |
| 3-pass, dx-cache, **private** pref, TPB 64 → 128 | 61.3 | 79.6 | **−8.2%** |
| **3-pass, dx-cache, private pref, TPB 96** | **60.8** | **79.2** | **−9.0%** |
| 3-pass, no dx-cache, private pref, TPB 96 | 61.2 | 79.6 | −8.4% |
| 3-pass, dx-cache, private pref, TPB 160 | 63.9 | 82.2 | −4.3% |
| **fused** inverse+peel, private pref, TPB 128 | 63.1 | 81.2 | (−5.4%) |
| fused inverse+peel, workgroup pref, TPB 64 | 68.6 | 87.0 | **+2.8% (worse)** |

### Reading

- **The lever is occupancy.** Moving `pref_scratch` to `var<private>` removes the
  workgroup-memory cap, and TPB can then rise. The sweet spot is **TPB 96**
  (TPB 64 leaves occupancy on the table; TPB ≥ 160 becomes register-bound and
  regresses). This is the whole win: **−9% on the walker phase, −7% GPU total.**
- **Fusing the inverse+peel passes is a net loss.** Merging them removes the
  `inv_dx` round-trip through `pref_scratch` and the `dx_cache` registers, but it
  *raises peak live-register pressure* inside the merged loop — and on an
  occupancy-bound kernel that lowers resident-workgroup count and is slower at
  every point. Kept as a knob (`walkerFused`, default off) for architectures with
  different register/occupancy trade-offs, but it does not help Apple.
- **`dx-cache` is a marginal positive** (~0.4 ms at TPB 96) and stays on by
  default. It is register-cheap relative to the inversion's own working set.
- **S is a dead-end for speed** (confirmed by prior threads: the walker is flat
  across S=8…32 on real Apple — it is memory-/occupancy-bound, not
  inversion-bound). S remains only a **memory** knob (see §4).

## 4. S as a memory knob (not a speed knob)

`S` (slots per thread) still scales the device scratch
(`walkerPartials`/nodes/`taskCuts` ∝ S) and, in the workgroup-pref mode, the
shared memory. With the default `private` pref it scales per-thread registers
instead. It does **not** move the time needle (the kernel is occupancy-bound),
so it is left at the memory-friendly default 8 and used only when a smaller
device-scratch footprint is wanted.

**Walker device scratch (NUM_THREADS=8192), excludes SRS/`l0_index`/`bucket_sums`:**

| S | @2¹⁷ | @2²⁰ |
|--:|--:|--:|
| 8 | ~12.8 MB | ~18.9 MB |
| 4 | ~7.8 MB | ~13.9 MB |
| 2 | ~5.3 MB | ~11.4 MB |

The walker stays ~4.5× below the V2 pair-tree's ~62 MB accumulation buffers and
keeps the whole MSM far under the 100 MB budget to n=2²⁰.

## 5. Current configuration

Defaults (`MsmConfig`):

- `walkerPrefMem: 'private'` (URL `?prefmem=`) — frees the workgroup-memory cap.
- `walkerTpb: 96` (URL `?wtpb=`) — occupancy sweet spot.
- `walkerCacheDx: true` (URL `?cachedx=`) — marginal positive.
- `walkerFused: false` (URL `?fused=`) — measured regression on Apple; knob only.
- `walkerS: 8` (URL `?ws=`) — memory knob, time-neutral.

With `prefMem: 'private'` there is no workgroup-memory ceiling, so the original
Mali-Bifrost reason for TPB ≤ 64 no longer applies.

## 6. Correctness

Validated GPU-vs-Noble (CPU pippenger reference) at logn=8 and logn=10 under
**SwiftShader** (software Vulkan, no GPU) — the WASM MT oracle is unavailable in
this environment. PASS across the full knob matrix: S ∈ {2,4,8}, TPB ∈
{64,96,128,160,256}, dx-cache on/off, fused on/off, pref workgroup/private.

```
[noble-check] logN=8  PASS (WebGPU matches Noble)
[noble-check] logN=10 PASS (WebGPU matches Noble)
```

## 7. Reproduce

```bash
cd barretenberg/ts && yarn install && yarn generate:wgsl
yarn dev:msm-webgpu --host 127.0.0.1 --port 5173   # terminal 1

# Correctness (SwiftShader, no GPU):
node dev/msm-webgpu/noble-check-swiftshader.mjs 8,10                 # defaults
node dev/msm-webgpu/noble-check-swiftshader.mjs 8 '&prefmem=workgroup&wtpb=64'

# On-device A/B ladder (BrowserStack), one seat, isolates each lever:
node dev/msm-webgpu/scripts/run-browserstack.mjs \
  --target macos --autorun msm-gpu-bench --n 17 --reps 8 \
  --query 'fusedab=1&sweep=8'
```
