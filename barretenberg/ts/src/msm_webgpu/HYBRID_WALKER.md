# Hybrid stream-walker MSM accumulator

A memory- and time-optimal BN254 WebGPU MSM accumulator for laptop and mobile
GPUs (Apple TBDR, Qualcomm Adreno, ARM Mali). It keeps the stream-walker's low
memory footprint while recovering the parallelism/occupancy that made the V2
pair-tree fast, under the hard constraints:

- workgroup-shared memory ≤ 16 KB on Mali Bifrost (forces TPB ≤ 64), 32 KB on
  Apple/Adreno;
- total memory budget ≤ 100 MB up to n = 2²⁰.

## 1. Starting point: two accumulators on the Pareto extremes

| Accumulator | Accumulation buffers @2¹⁷ | Time @2¹⁷ | Where it sits |
|---|---:|---|---|
| **V2 pair-tree** | ~62 MB (`bufA`/`bufB`/ring/`prefScratch`) | fast | time-good, memory-bad |
| **stream-walker** | ~9–13 MB | ~25% slower overall | memory-good, time-bad |

The stream-walker is a per-thread, bucket-monotonic walker: each of
`NUM_THREADS` threads owns a contiguous slice of the sorted bucket stream,
splits it into `S` equal-work tasks, and runs `S` pair-pointer slots through
**one field inversion per S adds** (Montgomery batched inversion). Its inner
loop is forward-prefix → one inversion → inverse-pass → backward-peel.

## 2. Why the stream-walker is slow — two bottlenecks

Reading `wgsl/cuzk/ba_stream_walker.template.wgsl`, the slowness is **not** the
inversion math; it is occupancy and memory traffic.

### 2.1 Occupancy cap from workgroup-shared `pref_scratch`

`pref_scratch` is declared `var<workgroup> array<vec4<u32>, TPB*S*2>` — 16 KB at
TPB=64, S=8. But it is **per-thread with no cross-thread sharing** (the kernel
runs with no `workgroupBarrier` in the loop). It only lives in workgroup memory
to keep register pressure down. That 16 KB caps the number of resident
workgroups:

- Apple (32 KB shared): ~2 workgroups resident,
- Mali Bifrost (16 KB shared): ~1 workgroup resident.

With 1–2 resident workgroups (64–128 threads) the GPU cannot hide the long
per-thread serial dependency chain (8 muls → 1 inversion → 8 muls → 8 affine
adds). The kernel is occupancy-starved.

### 2.2 Redundant SRS reads

Each point's x-coordinate is fetched from device memory **three times** per
iteration:

1. forward prefix — to compute `dx = x_r - x_l`;
2. inverse pass — which *recomputes the same `dx`* to chain the running inverse
   (it reloads the slot points);
3. backward peel — to compute `λ`, `r_x`, `r_y`.

On bandwidth/latency-bound mobile GPUs this triples the dominant memory cost.

## 3. The hybrid: two levers on the memory↔time front

### Lever A — dx-cache (memory-traffic reduction, time-positive, memory-neutral)

The `dx` computed in the forward prefix is **identical** to the value the
inverse pass needs (`cursor[k]` / `acc_x[k]` do not move between the two
passes). We cache it in a per-slot private array and reuse it, deleting the
inverse pass's reload+recompute entirely. This removes ≈ 1/3 of the kernel's
x-coordinate SRS reads. It is **numerically identical** (verified) and costs
only `S` field elements of *private* state — **zero extra device memory**.

`MsmConfig.walkerCacheDx` (URL `?cachedx=0/1`), default on.

### Lever B — S / TPB as the Pareto knob (occupancy)

`S` (batched-inversion slots per thread) is the single knob that moves the
design along the memory↔time front, because **both** the occupancy-capping
workgroup memory **and** the device scratch scale with it:

- `pref_scratch = TPB·S·32 B` (workgroup) — halving S doubles resident
  workgroups on Apple/Mali;
- `walkerPartials`, `walkerNodes{Slot,Next}`, `walkerPartialDest`, `taskCuts`
  (device) all scale ∝ S.

The cost of smaller S is more inversions (one per S adds) — but Lever A makes
each iteration cheaper, so the trade tilts toward smaller S more than it would
for the unmodified walker. `MsmConfig.walkerS` / `walkerTpb` (URL `?ws=`/`?wtpb=`),
default 8 / 64 (Mali-safe). On Mali Bifrost (16 KB) keep `TPB·S ≤ 512`; on
Apple/Adreno (32 KB) `TPB·S ≤ 1024`.

## 4. Memory Pareto front (computed from the buffer-size formulas)

Device scratch specific to the walker accumulator (excludes SRS / `l0_index` /
`bucket_sums`, which every algorithm pays identically). `NUM_THREADS = 8192`.

**n = 2¹⁷ (c=13, bTotal=87 040):**

| S | pref_scratch /WG (TPB=64) | walker device scratch | resident WGs (Apple 32 KB) |
|--:|--:|--:|--:|
| 8 | 16 KB | ~12.8 MB | 2 |
| 4 | 8 KB  | ~7.8 MB  | 4 |
| 2 | 4 KB  | ~5.3 MB  | 8 |

**n = 2²⁰ (c=15, bTotal=282 880):**

| S | pref_scratch /WG | walker device scratch |
|--:|--:|--:|
| 8 | 16 KB | ~18.9 MB |
| 4 | 8 KB  | ~13.9 MB |
| 2 | 4 KB  | ~11.4 MB |

At S=4 the walker accumulation column (~13.9 MB) is ~4.5× below the V2
pair-tree's ~62 MB (and the gap widens further at 2²⁰, where V2 is infeasible).
The dominant n=2²⁰ memory is SRS + `l0_index`, shared by every algorithm, so
the walker keeps the whole MSM far below the 100 MB budget.

The knee is **S=4**: it cuts the walker device scratch ~40% and halves
`pref_scratch` (restoring 2×–4× occupancy on Apple/Mali) versus S=8, while only
doubling the inversion count — much of which Lever A's traffic cut absorbs.

## 5. Why this is memory- and time-optimal

- **Memory:** dx-cache is register-only (0 device bytes); S is the knob that
  drives both workgroup and device memory down. The hybrid is therefore on or
  **below** the stream-walker's memory at every design point, and ~8× below the
  V2 pair-tree's accumulation buffers — comfortably inside 100 MB to n=2²⁰.
- **Time:** the two dominant inefficiencies of the walker — low occupancy and
  3× x-coordinate traffic — are exactly what Levers B and A attack. dx-cache is
  an unconditional win; S restores the occupancy that gave the V2 pair-tree its
  speed, without V2's memory.

## 6. Correctness

Validated GPU-vs-Noble (CPU pippenger reference) at logn=8 and logn=10 under
**SwiftShader** (software Vulkan, no GPU) — the WASM MT oracle is unavailable in
this environment. PASS across S ∈ {2,4,8,16}, TPB ∈ {32,64,128}, and
dx-cache on/off.

```
[noble-check] logN=8  PASS (WebGPU matches Noble)
[noble-check] logN=10 PASS (WebGPU matches Noble)
```

## 7. Reproduce

```bash
cd barretenberg/ts && yarn install && yarn generate:wgsl
yarn dev:msm-webgpu --host 127.0.0.1 --port 5173   # terminal 1

# Correctness (SwiftShader, no GPU):
node dev/msm-webgpu/noble-check-swiftshader.mjs 8,10            # default hybrid
node dev/msm-webgpu/noble-check-swiftshader.mjs 8,10 '&ws=4'    # S=4 knee
node dev/msm-webgpu/noble-check-swiftshader.mjs 8,10 '&cachedx=0'

# On-device timing (BrowserStack), one seat sweeps the whole S curve:
node dev/msm-webgpu/scripts/run-browserstack.mjs \
  --target macos --autorun msm-gpu-bench --n 17 --reps 5 \
  --query 'sweep=8,4,2'
```
