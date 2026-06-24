# WebGPU MSM — minimal port manifest

Fresh port of the WebGPU MSM work onto a current base, scoped to make the
standalone **MSM dev webpage** (`yarn dev:msm-webgpu`) build and run so its
results can be compared against the original `sb/integrate-wgpu-msm` branch.

## Provenance

| | |
|---|---|
| Base | `merge-train/barretenberg` @ `6deae81809` (2026-06-24) |
| Source | `sb/integrate-wgpu-msm` @ `a7fe6a6257` |
| This branch | `sb/webgpu-msm-fresh` |
| Original fork point | `next` @ `a27cd18c38` (2026-05-12) — 453 commits of base drift since |

## What was ported (3 logical commits)

The original branch is 131 commits; this rolls the **surviving production spine**
into 3 commits. Dead experiments and chonk-e2e harnesses were left out.

1. **C++ hook + native Pippenger exports** — `ecc/scalar_multiplication/webgpu_msm_hook.{cpp,hpp}`,
   `webgpu_msm_marshalling.{hpp,test.cpp}`, `CMakeLists.txt` (the `BBERG_WEBGPU_MSM_HOOK` option).
   Rolls up Phase-0 bridge foundation (`beb8de59`, `74649bc3`).
2. **MsmV2 pipeline + GPU bridge + wasm wiring** — all of `src/msm_webgpu/**`
   (MsmV2, BatchMsmV2, additive masking, bridge, shaders) plus the wasm hook-stub
   wiring (`barretenberg_wasm_*`, `bb_backends/*`) and `package.json` deps/scripts.
   Rolls up Phase-3 MsmV2 (`5112973…6897d5e`) + the in-`src` Phase-4 pieces
   (BatchMsmV2 `7e79b3b8`/`8674b3a7`, masking `01a61a0c`, GPU histogram `c918d05c`).
3. **MSM dev webpage** — `dev/msm-webgpu/**` (the WebGPU-vs-WASM comparison page,
   SRS loader, GPU decompress, perfetto). Rolls up Phase-0 dev page + Phase-3
   `dc41af17` (index.html driven by MsmV2).

## Adaptations for base drift (read this before comparing)

Merge-train did a **Pippenger rewrite** after our fork. The old MSM moved to
`bb::scalar_multiplication::legacy::MSM`; a new facade `bb::scalar_multiplication::MSM`
has a different signature. Consequences:

- `scalar_multiplication.{cpp,hpp}` were **NOT modified** — merge-train's
  `legacy::MSM::batch_multi_scalar_mul` already *is* the un-hooked native affine
  Pippenger the page's WASM column needs.
- `webgpu_msm_hook.cpp` was adapted: its `bb_native_pippenger_bn254_*` exports now
  call `legacy::MSM<BN254>::batch_multi_scalar_mul(...)` instead of the original
  `MSM<BN254>::batch_multi_scalar_mul_native(...)`. Call signatures are identical.
- `barretenberg/index.ts` was **NOT ported** — its only delta was Phase-4
  measurement methods (`emitMsmPhase`/`dumpBenchTraceJson`/`benchClockNs`) the page
  does not use.
- `package.json` `clean` script merged with merge-train (which dropped a stale
  `aztec-wsdb/generated` path); `serve:chonk-webgpu` script dropped (yarn-project
  not ported).

## Deliberately excluded (not needed for the standalone page)

- **Phase 1+2a/2b** — the tree-reduce SMVP line + all microbench shaders.
  Already deleted at the source HEAD; dead code.
- **Phase-4 chonk e2e** — `yarn-project/ivc-integration` serve page, CDP drivers,
  and the C++ MSM-label callers (`commitment_key`, `gemini`, `shplonk`, `eccvm_*`,
  `flavor`, `*_prover`, `bb_bench`). The hook still compiles: it receives `labels`
  as a defaulted `{}` from un-modified callers.
- **Production MSM→WebGPU bridge delegation** in `scalar_multiplication.cpp`. The
  page runs MsmV2 directly in TS and never delegates C++→GPU, so this was skipped.
  (If you later want chonk delegation, that block must be re-inserted into
  merge-train's `legacy::MSM::batch_multi_scalar_mul` and re-validated against the
  facade dispatch.)

## Build & run

```bash
# 1. TS deps (adds @noble/curves, vite, @webgpu/types, mustache, … — updates yarn.lock)
cd barretenberg/ts && yarn install

# 2. Inline the WGSL shaders (also part of `yarn build`)
yarn generate:wgsl

# 3. Build the hooked wasm (REQUIRED for the WASM comparison column)
cd ../cpp
cmake --preset wasm-threads -DBBERG_WEBGPU_MSM_HOOK=ON
cd build-wasm-threads && ninja barretenberg.wasm.gz

# 4. Serve the page (needs a real GPU + a Chromium with WebGPU)
cd ../../ts && yarn dev:msm-webgpu
# open the printed localhost URL
```

The WebGPU MsmV2 column is pure TS/WGSL and self-checks against noble even
without the wasm; the wasm build only powers the WASM-Pippenger comparison column.

## Comparison checklist (vs the original branch's page)

- WebGPU column shows ✓ (matches noble) at every size 2^10…2^20.
- WebGPU MsmV2 medians within run-to-run noise of the original page.
- BatchMsmV2 sweep present and consistent.
- If any size is missing / WebGPU ✗ where the original was ✓ → a shader or
  `msm_v2.ts` file was missed in the port.
