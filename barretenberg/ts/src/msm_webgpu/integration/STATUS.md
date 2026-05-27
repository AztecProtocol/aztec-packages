# Status — WebGPU MSM Integration

*Last refreshed: 2026-05-26. Branch: local working tree on `sb/integrate-wgpu-msm`.*

---

## Recent landing: per-label block-list (2026-05-26)

The integration now supports **selective WebGPU delegation** via a runtime
block-list of label names that always stay on the native CPU Pippenger.
Default block-list when `webgpuMsm: true` is `[]` (delegate everything at
`n ≥ 2¹⁴`); the canonical safe-set for the Chonk flow is
`['LOOKUP_READ_COUNTS', 'LOOKUP_READ_TAGS', 'VK_PRECOMPUTED_POLY']` —
the three label families that show degenerate single-bucket-dominated
scalar distributions in the empirical analysis at
[/tmp/zac-webgpu/chonk-delegate-eligible.md](file:///tmp/zac-webgpu/chonk-delegate-eligible.md).

Wired in:

- `bb_set_webgpu_msm_blocklist(const char* labels_csv)` WASM_EXPORT.
- TS option `webgpuMsmBlocklist?: readonly string[]` on
  `Barretenberg.initSingleton`.
- New 3-mode comparative test in `chonk_browser_webgpu_bench.test.ts`:
  off / on-all / on-blocklist; asserts VK byte-equality across all
  three on hardware GPU.
- All four tests in the bench suite are now SwiftShader-aware (Linux CI
  without hardware GPU passes by skipping the GPU-dependent assertions).

CPU cost of blocking those 23 columns: **463 ms / 8049 ms = 5.8%** of
total CPU MSM time on the canonical flow. Effectively free.

---

A single-page snapshot of what's true on the branch right now. If something
here disagrees with the code, the code wins — fix this page.

---

## Branch + base

- Working off `origin/zw/msm-webgpu-experiments-v2` at `6897d5e68a`.
- Eventual base for upstream PRs: `merge-train/barretenberg` (per
  `barretenberg/CLAUDE.md`).
- We have not yet branched off; doing so is a prerequisite to any
  non-doc change.

## Pipeline

The cuZK driver is gone (removed in `396392be0b`). **MsmV2 is the only
WebGPU MSM pipeline.**

- Algorithm host: [msm_v2.ts](../msm_v2.ts) — `MsmV2Pool` (SRS pool, uploaded
  + Montgomery-converted once on the GPU) and `MsmV2` (per-size pipeline
  with `create()` / `prepare()` / `run()` phases).
- Shaders: [wgsl/](../wgsl/) — much smaller than the cuZK era; the
  generated `wgsl/_generated/shaders.ts` is ~184 KB now (was ~384 KB
  pre-collapse).
- Public surface: [index.ts](../index.ts) — exports `MsmV2`, `MsmV2Pool`,
  the bridge wiring (`WebGpuMsmHost`, `WebGpuMsmWorkerStub`,
  `setupWebGpuMsmBridge`, `installWorkerStub`), and the control-buffer
  protocol.

## Bridge (WASM ↔ GPU)

End-to-end functional. VKs match the WASM-MT baseline (per the bench
asserts described in [WEBGPU_CHONK_STATUS.md](../WEBGPU_CHONK_STATUS.md)).

C++ side (compile-time gated by `BBERG_WEBGPU_MSM_HOOK`, WASM build only;
runtime gated by `bb_set_webgpu_msm_enabled(1)` — defaults to OFF so a
WASM with no bridge installed never tries to call the import):
- [scalar_multiplication.cpp:545](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp#L545)
  — delegation site inside `batch_multi_scalar_mul` (`#ifdef` block
  starts at line 510, call at 546).
- [webgpu_msm_hook.{hpp,cpp}](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/) —
  WASM imports `bb_external_msm_bn254` (returns `(num_windows<<16)|c`,
  takes `srs_offset`; result region is `num_windows × 64` per-window
  sums), `bb_external_batch_msm_bn254` (one GPU submit per batch),
  `bb_publish_srs_bn254`. Per-MSM size threshold
  `WEBGPU_MSM_THRESHOLD` default `2^14`
  ([webgpu_msm_hook.hpp:34-36](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp#L34-L36))
  — below this each MSM stays on the native Pippenger; checked per-MSM,
  not per-batch. `combine_windows`
  Horner-folds the per-window sums natively.
- [webgpu_msm_marshalling.hpp](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_marshalling.hpp) —
  `(0,0)` → infinity decode; covered by `webgpu_msm_marshalling.test.cpp`.

TS side:
- [bridge/protocol.ts](../bridge/protocol.ts) — `CTRL_SLOTS`, opcodes
  (`OP_MSM`, `OP_BATCH_MSM`, `OP_PUBLISH_SRS`), slot indices including
  `SLOT_SRS_OFFSET`, `SLOT_BATCH_META_PTR`, `SLOT_BATCH_LABELS_PTR`.
- [bridge/main.ts](../bridge/main.ts) — `WebGpuMsmHost` owns the
  `MsmV2Pool`, a pinned SRS-sized `MsmV2` instance (`srsMsm`), and an
  LRU of other per-N instances (`MSM_LRU_CAP = 16`,
  [bridge/main.ts:30](../bridge/main.ts#L30)). Two encoder paths gated
  on whether any N appears more than once in the batch
  ([bridge/main.ts:538](../bridge/main.ts#L538)): no collisions →
  single-encoder, one submit, one mapAsync; collisions → per-MSM submit
  + batched `Promise.all` mapAsync. Per-MSM telemetry emitted from
  both paths. A `slotPools` field + `getOrCreateMsmSlot` helper are
  vestiges of a reverted slot-pool experiment ([bridge/main.ts:525-537](../bridge/main.ts#L525-L537));
  not on the live path.
- [bridge/worker_stub.ts](../bridge/worker_stub.ts) — worker env imports;
  blocks via `Atomics.wait`.

## Measurement surfaces

- **Browser bench page**: [dev/msm-webgpu/](../../../dev/msm-webgpu/) —
  WebGPU vs WASM (1t and Nt) over `n ∈ [2¹⁰, 2²⁰]`, with optional noble
  cross-check at `n = 2¹⁶`. Run via `yarn dev:msm-webgpu` in
  `barretenberg/ts/`.
- **Headless Chonk e2e**:
  [yarn-project/ivc-integration/src/chonk_browser_webgpu_bench.test.ts](../../../../../yarn-project/ivc-integration/src/chonk_browser_webgpu_bench.test.ts) —
  runs the pinned `ecdsar1+transfer_1_recursions+sponsored_fpc` flow
  webgpu=off vs webgpu=on under puppeteer Chromium, asserts both verify
  and produce byte-identical VKs.

## Current performance position (M4 Pro, Metal-3, Chromium headless)

From [WEBGPU_CHONK_STATUS.md](../WEBGPU_CHONK_STATUS.md):

| Configuration | Wall | Notes |
|---|---|---|
| `webgpu=off` (WASM-MT, 16 threads) | ~6.0 s | CPU baseline |
| `webgpu=on` (WebGPU bridge) | ~7.6 s | **0.78× of CPU** — slightly slower |

WebGPU is **functionally correct but performance-negative** on chonk's actual
size distribution (`n ∈ [16k, 131k]`). The 3× win MsmV2 shows at `n = 2²⁰` is
out of range for this workload. See ROADMAP.md for the three named levers
that could flip this.

## Known limitations

- **MsmV2 pair-tree assumes SRS-backed inputs only** — the affine-add
  pair-tree has no point-at-infinity / `dx == 0` handling. Per the
  [msm_v2.ts](../msm_v2.ts) file header this is a stated *production
  contract*, not a deficiency: the C++ hook enforces it by delegating
  only when `handle_edge_cases == false`
  ([scalar_multiplication.cpp:545](../../../../cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp#L545)).
  Callers that need edge-case handling stay on the native Pippenger.
- **`MSM_DESIGN_ANALYSIS.md` (parent dir) is stale** — describes the
  removed cuZK pipeline. Still useful as a Pippenger / WASM-MT primer;
  Sections 4+ no longer match the tree. The live MsmV2 reference lives
  in [ALGORITHM.md](ALGORITHM.md) (sections 1–7 filled as of M2; §8
  memory levers and §9 bridge protocol still stubs).
- **`v4 pipeline memory note` referenced from `WEBGPU_CHONK_STATUS.md:146`**
  points to `.claude/projects/.../msm_webgpu_v4_pipeline.md` — a Claude
  memory file on Zac's machine, not in-tree. If that plan is load-bearing
  for the multi-MSM-concurrent-shaders work (ROADMAP M4), we need it
  in-repo.

## Open questions

- Which lever in [ROADMAP.md](ROADMAP.md) do we tackle first?
- Should we branch off `zw/msm-webgpu-experiments-v2` directly, or rebase
  onto `merge-train/barretenberg` first? Depends on whether Zac's branch
  is destined for the merge train or a long-lived feature line.
- Do we own the cross-platform validation surface (Apple/NVIDIA/Adreno) or
  is Zac running that? The `Adreno-safe bucket+sign pack` commit
  (`e0337c3515`) suggests active multi-vendor work.

## Profile snapshot — 2026-05-26

The dev page **Profile** button (currently × 40) runs WebGPU-only at the
current `log₂(n)`, enrols `timestamp-query` on every `encodeIntoBatch`
dispatch + the prepare-time `bucket_histogram` pass, and renders a
per-pass breakdown (absolute median ms + % of wall) + a host-phases
breakdown table + a CSV dump on the JavaScript console. A *per-batch
breakdown* checkbox switches between collapsed (one row per stage) and
expanded (one row per `(stage, batch)`) views.

### Stage labels surfaced

GPU passes inside `run()` (`<stage>#<batchIdx>` for everything inside the
per-batch loop, bare `<stage>` for the reduction tail):

```
decompose, xpose_count, xpose_reduce, xpose_scan, xpose_scatter,
csr2v2_active, csr2v2_meta, planner_a, planner_b, fused, carry, finalize,
reduce_init, reduce_level
```

Prepare-time GPU pass (its own row, separate from run-time passes):
`bucket_histogram_gpu` — the per-bucket Booth-recoded histogram dispatch
that feeds the level-walk planner ([msm_v2.ts](../msm_v2.ts)).

Host phases (one row per `performance.now()` delta inside `prepare()` /
`run()`):

```
host_prepare (= scalar_upload_wall + prep_booth_decode + prep_level_plan + prep_other)
  ↳ scalar_upload_wall    (Chrome's host-blocking writeBuffer memcpy)
  ↳ prep_booth_decode     (histogram dispatch + mapAsync wait + readback memcpy)
      ↳ bucket_histogram_gpu  (GPU dispatch only — timestamp-query)
  ↳ prep_level_plan       (host JS loop over the bucket grid)
  ↳ prep_other            (fits-check + ensureScratch + bind groups OR fast-path uniform writes)
host_encode, host_submit_wait, host_decode, wall, e2e (= host_prepare + wall)
prepare_kind = fast | slow
```

One-time setup (rendered as a separate *Setup* table the first time the
button is clicked): `srs_fetch`, `srs_decompress`, `pool_upload`,
`pool_convert`.

`gpu_other = wall − Σ profiled_passes` accounts for `clearBuffer`s,
`resolveQuerySet`, and per-window gather `copyBufferToBuffer`s that
`timestampWrites` doesn't cover.

### Snapshot @ log₂(n) ∈ {12, 16, 20} — M4 Pro, Chromium

Captured 2026-05-26 with the GPU bucket-histogram path enabled (default).
Medians of 40 reps each, all reps on the fast path after the first.

| log₂(n) | host_prepare | wall | e2e | fused (in wall) | bucket_histogram_gpu |
|---|---:|---:|---:|---:|---:|
| 12 | 0.78 ms | 8.4 ms | 9.2 ms | 3.2 ms | < 0.1 ms |
| 16 | 2.93 ms | 19.0 ms | 22 ms | 10.2 ms | 0.13 ms |
| 20 | 25.1 ms | 203.6 ms | 229 ms | 154 ms | 1.38 ms |

The GPU histogram dispatch itself is essentially free (1.38 ms at n=2²⁰).
Inside `prep_booth_decode = 5.6 ms` at n=2²⁰, that 1.38 ms is the GPU
dispatch; the remaining ~4 ms is `mapAsync` polling + 2 MB readback.

### GPU bucket-histogram path

The level-0 Booth decode + per-bucket histogram (previously a 250 ms
single-threaded JS loop in `buildInitCounts` on n=2²⁰) moved to GPU as a
new `bucket_histogram` compute pass dispatched at the top of
`MsmV2.prepare()`. The host then runs the per-level walk on the
GPU-produced counts. See [msm_v2.ts](../msm_v2.ts) and
[wgsl/cuzk/bucket_histogram.template.wgsl](../wgsl/cuzk/bucket_histogram.template.wgsl).

End-to-end win (n=2²⁰, M4 Pro): `e2e` 355 → 229 ms (−126 ms, 35%
faster). The win compounds across the chonk flow (~1000 MSMs/proof in
the n∈[16k, 131k] band) because every distinct-`n` MSM pays the
slow-path Booth cost.

`prepare()` is now `async` — callers must `await msm.prepare(...)`. All
three real call-sites (dev page, bridge no-collision path, bridge
collision path) updated.

### Known performance regression — `fused` at n=2²⁰

The GPU-histogram path comes with a measurable **per-MSM regression of
~15 ms (≈10%) on the `fused` GPU pass at n=2²⁰**, confirmed via the
in-page `?hostHist=1` A/B knob:

| `fused` median, 40 reps | n=2¹² | n=2¹⁶ | n=2²⁰ |
|---|---:|---:|---:|
| GPU-histogram (default) | 3.15 ms | 10.3 ms | 151.9 ms |
| Host-histogram (`?hostHist=1`) | 3.60 ms | 9.04 ms | 137.2 ms |
| Δ | +0.45 ms (noise) | −1.26 ms (12%) | **−14.7 ms (10%)** |

The Δ scales with workload size — the fingerprint of a **system-level-cache
eviction**. The histogram pass at n=2²⁰ touches ~34 MB of GPU memory
(32 MB scalar read + 2 MB atomic-count write), which fills Apple's SLC
(~48 MB on M4) and evicts SRS lines that level-0 `fused` then has to
refetch from main memory. At n=2¹⁶ the cache pressure is smaller; at
n=2¹² fused is small enough that variance dominates the signal.

**Net trade**: −15 ms on `fused` vs −155 ms on `host_prepare` at n=2²⁰ →
the GPU-histogram path is still ~140 ms faster per MSM. Worth landing
as-is; the regression is bounded.

**Potential fixes**, in increasing engineering cost (cross-referenced as
M8 in [ROADMAP.md](ROADMAP.md)):
1. *Workgroup-shared histogram.* Each workgroup atomic-adds into private
   shared memory; one final reduce writes to global. Cuts the 2 MB
   atomic-write streaming traffic to ~256 KB. Doesn't help with the
   32 MB scalar read (unavoidable). Modest gain, contained change.
2. *Eliminate the histogram pass entirely* by reviving the static
   upper-bound plan (per-level pair/carry/stride from the recurrence
   `s_{k+1} ≤ floor(2/3·s_k)`). First attempt threw "value is not
   invertible" at n=2²⁰ — root cause was never isolated. If revived,
   eliminates both the histogram dispatch AND the prepare-time
   `mapAsync`. Largest win.
3. *Cache warm-up dispatch* after the histogram readback — a tiny
   compute pass that reads the first ~16 MB of `point_x`/`point_y` to
   repopulate SLC before `fused` submits. Hacky and device-tunable;
   discouraged unless (1) and (2) both fail.

**Diagnostic infra in tree.** The A/B knob `?hostHist=1` on the dev page
routes `prepare()` through the host `buildInitCounts` loop instead of
the GPU histogram dispatch. Use it to re-measure the cache effect after
any change to the bucket-histogram kernel or the surrounding scheduling.
