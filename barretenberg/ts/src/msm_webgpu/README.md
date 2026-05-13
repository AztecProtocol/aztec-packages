# msm_webgpu — WebGPU BN254 MSM port

BN254-only WebGPU multi-scalar multiplication, ported from
[tal-webgpu](https://github.com/...) (`sb/bn254` branch). Intended to
plug into the bb.js prover via the WASM-import host callback described
in `WEBGPU_BBERG_INTEGRATION_PLAN.md`.

## Layout

- `msm.ts` — top-level entry. Re-exports the BN254 MSM functions from
  the original `submission.ts`. Imports rewritten for NodeNext +
  inlined-WGSL.
- `cuzk/` — host-side TypeScript driving the pipeline (shader
  generation, GPU buffer management, persistent context, SRS caching,
  batch-affine SMVP). Direct copy of the BN254-relevant subset of
  tal-webgpu's `implementation/cuzk/`.
- `wgsl/` — WGSL shader sources (BN254 only). Curve-agnostic shared
  templates plus BN254 forks for SMVP / BPR / EC arithmetic / horner.
- `wgsl/_generated/shaders.ts` — generated TypeScript module exporting
  every WGSL source as a string constant. Regenerate via
  `yarn generate:wgsl`. Imported by `cuzk/shader_manager.ts`.
- `scripts/inline-wgsl.mjs` — the generator above.
- `types.ts` — `BigIntPoint`, `U32ArrayPoint`, and one debug helper.
- `webgpu.d.ts` — ambient reference to `@webgpu/types` scoped to this
  directory.

## What was dropped

The port intentionally omits paths irrelevant to the Chonk integration:

- BLS12-377 curve support (`bls12_377.ts`, `ec_bls12_377.template.wgsl`,
  `smvp_bls12_377.template.wgsl`, `bpr_bls12_377.template.wgsl`).
- The `compute_msm` BLS entry point.
- The `compute_atheonxyz_bn254_msm` variant.
- GLV cold-path entries (`compute_bn254_msm_glv*`,
  `glv_bn254.ts`).
- CPU reference implementations (`cpu_smvp_signed`, `cpu_transpose`,
  `parallel_bucket_reduction_*`) — stubbed to throw. These are only
  reachable when `log_result === true`, which the production path
  never sets.
- The React/Tailwind UI and the puppeteer test harness.
- `@celo/bls12377js`, `@noble/curves`, `ffjavascript`, the custom
  `FieldMath` class, and other test-only dependencies that came along
  for the ride.

## Build wiring

Re-generating shaders runs as a `prebuild`-style step:

```
yarn generate:wgsl   # writes wgsl/_generated/shaders.ts
```

Wired into `yarn build` so a fresh clone produces the generated file
before tsc reads it.

## Local correctness page

A standalone Vite-served page at
[`barretenberg/ts/dev/msm-webgpu/`](../../dev/msm-webgpu/) cross-checks
`compute_bn254_msm` against an in-process `@noble/curves/bn254`
reference. Failures here indicate the WGSL kernels or the Montgomery
marshalling are wrong before any bb.js bridge layer is involved.

```
cd barretenberg/ts
yarn install                # picks up @noble/curves + vite devDeps
yarn dev:msm-webgpu         # opens http://127.0.0.1:5173/dev/msm-webgpu/
```

The page generates *n* random `(point_i, scalar_i)` pairs (default *n*
= 4096), runs the GPU MSM, computes the reference MSM in JS, and
prints pass/fail with the affine coordinates of each result. Requires
a WebGPU-capable browser (Chrome 113+, recent Safari TP).
