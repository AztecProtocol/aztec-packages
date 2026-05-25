# Status — WebGPU MSM Integration

*Last refreshed: 2026-05-25. Branch tip: `6897d5e68a` (Zac's
`zw/msm-webgpu-experiments-v2`).*

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
