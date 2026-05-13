# WebGPU BN254 MSM → Barretenberg Chonk Integration — Status

Scaffolding for the integration described in
[WEBGPU_BBERG_INTEGRATION_PLAN.md](../tal-webgpu/WEBGPU_BBERG_INTEGRATION_PLAN.md).
Branch: `sb/msm-webgpu`, based on `origin/next` at `a27cd18c38`.

## What works end-to-end

Nothing yet runs an actual proof — this branch is **plumbing**, not a
working demo. Everything below is in tree but each piece needs an
integration-level smoke test the user has to drive.

## What's in tree

### C++ side (`barretenberg/cpp/`)

| Path | Purpose |
|---|---|
| [ecc/scalar_multiplication/webgpu_msm_hook.hpp](barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp) | Declares the imported `bb_external_msm_bn254` / `bb_publish_srs_bn254` and a C++ batch wrapper `batch_multi_scalar_mul_webgpu_bn254`. Gated on `BBERG_WEBGPU_MSM_HOOK`. |
| [ecc/scalar_multiplication/webgpu_msm_hook.cpp](barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.cpp) | Marshalling layer: AffineElement → LE bytes (auto Montgomery-strip) → JS hook → LE bytes → AffineElement (auto Montgomery-rewrap). Handles point-at-infinity and one-shot SRS publish. |
| [ecc/scalar_multiplication/scalar_multiplication.cpp](barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp) | Inserted a 10-line `if constexpr (BN254) { delegate to webgpu hook }` at the top of `batch_multi_scalar_mul`. Edge-case path stays on native Pippenger. |
| [CMakeLists.txt](barretenberg/cpp/CMakeLists.txt) | Adds `option(BBERG_WEBGPU_MSM_HOOK …)`. When set in a WASM build, defines the compile macro. Fatal-errors out on non-WASM builds. |

### TypeScript / bb.js side (`barretenberg/ts/src/msm_webgpu/`)

| Path | Purpose |
|---|---|
| `msm.ts` | 2980-line port of tal-webgpu `submission.ts`. BN254 only; BLS/GLV/atheonxyz top-level entries removed; NodeNext `.js` import suffixes applied. |
| `cuzk/` | Direct port of tal-webgpu's `implementation/cuzk/*.ts` host driver. BLS12-377 paths dropped. CPU reference helpers (`smvp.ts`, `bpr.ts`, `transpose.ts`) reduced to throwing stubs (only reachable when `log_result === true`, which the production path never sets). |
| `wgsl/` | BN254-only subset of tal-webgpu's WGSL templates. |
| `wgsl/_generated/shaders.ts` | Auto-generated: 28 WGSL sources inlined as string constants. Regenerate via `yarn generate:wgsl`. |
| `scripts/inline-wgsl.mjs` | The generator above. |
| `bridge/protocol.ts` | SAB layout constants (`CTRL_BYTES`, slot indices, state values, opcodes). |
| `bridge/worker_stub.ts` | `WebGpuMsmWorkerStub` — exposes `bb_external_msm_bn254` / `bb_publish_srs_bn254` as functions to merge into the WASM `env`. Uses `Atomics.wait` to block the worker. |
| `bridge/main.ts` | `WebGpuMsmHost` — runs on the main thread, holds the `GpuContext` and (lazily) a `CachedBases`, dispatches incoming MSM/PUBLISH_SRS requests, writes results back into shared WASM memory. |
| `bridge/protocol.test.ts` | Bridge protocol unit test (jest, runs in node). |
| `setup.ts` | `setupWebGpuMsmBridge(worker)` — wires up the bridge from the main thread. `installWorkerStub(...)` — worker-side counterpart. |
| `types.ts` | `BigIntPoint`, `U32ArrayPoint`, `readBigIntsFromBufferLE`. |
| `webgpu.d.ts` | Scoped `/// <reference types="@webgpu/types" />` so this directory sees `GPUDevice` etc. without polluting the rest of bb.js. |
| `index.ts` | Public entry point. |
| `README.md` | Layout / dropped-content reference. |

### bb.js base (`barretenberg/ts/src/barretenberg_wasm/`)

- [barretenberg_wasm_base/index.ts](barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_base/index.ts):
  added `setExtraEnvImports(imports)` so the bridge stub can be merged
  into the wasm env without the base class needing to know about
  WebGPU.

### Playground (`playground/`)

- [components/MsmBenchmark.tsx](playground/src/components/MsmBenchmark.tsx)
  — side-by-side prove-and-time UI. Imports the WebGPU bridge lazily;
  shows a clear error if `barretenberg-webgpu.wasm` hasn't been built
  yet. Not yet hooked into the playground's router — drop it into the
  page tree wherever convenient. COOP/COEP headers are already set in
  `playground/vite.config.ts`.

### Top-level docs

- [WEBGPU_BBERG_INTEGRATION_PLAN.md](../tal-webgpu/WEBGPU_BBERG_INTEGRATION_PLAN.md) — the architecture plan this branch implements.
- [WEBGPU_INTEGRATION_STATUS.md](WEBGPU_INTEGRATION_STATUS.md) — this file.

## What's stubbed / left to do

1. **The actual proof flow on the WebGPU side.** `MsmBenchmark.tsx`
   currently runs a `setTimeout(50)` placeholder for both buttons.
   Replace with real `AztecClientBackend.prove()` calls once the
   WebGPU-enabled `.wasm` is built (see below).

2. **Build a separate `barretenberg-webgpu.wasm` artifact.** The
   `BBERG_WEBGPU_MSM_HOOK` compile flag is in place but the build
   system doesn't yet emit a second artifact under that name. Pick one:
   - Manual: do a CMake build with
     `-DCMAKE_TOOLCHAIN_FILE=<wasi> -DBBERG_WEBGPU_MSM_HOOK=ON`, copy
     the resulting `.wasm` into bb.js's resource directory under the
     name `barretenberg-webgpu.wasm.gz`, plumb a parallel loader.
   - Scripted: extend
     [barretenberg/ts/scripts/copy_wasm.sh](barretenberg/ts/scripts/copy_wasm.sh)
     to grab a second build output.

3. **TS compile verification.** The 2980-line `msm.ts` has been edited
   surgically (imports replaced, BLS/GLV exports removed) but I haven't
   run `tsc` against it in this session. Expect a few minor type
   issues — the GpuContext API was renamed once during the port, and
   there may be other surface-level snags. `yarn build` against bb.js
   with the new dependencies installed will surface them.

4. **A real port-level unit test.** A small "MSM of 2¹² random points
   against an `@noble/curves` reference" jest-puppeteer test would
   validate the port end-to-end before any of the integration layers
   come into play. Not in tree yet.

5. **A commit-level differential test (C++).** Build with
   `BBERG_WEBGPU_MSM_HOOK=ON` but link a *fake* `bb_external_msm_bn254`
   that calls the native Pippenger internally. Run the existing chonk
   tests against that. They should pass — verifies the marshalling
   layer's Montgomery-form round trip independently of WebGPU
   correctness.

6. **Grumpkin fallback.** The hook is BN254 only. Chonk also issues
   Grumpkin MSMs (translator / ECCVM). Those continue using native
   Pippenger; nothing to do unless they show up on the profile.

7. **Small-n cutoff.** Tal-webgpu's chunk-size policy makes the GPU
   slower than single-threaded WASM at very small n (~2¹²). The plan
   §7.5 noted a soft fallback in the bridge. Not implemented — the
   bridge always routes to the GPU. Add a `if (n < N_MIN) { call
   native Pippenger via a registered fallback }` once benchmarking
   shows the cutoff matters.

8. **AztecClientBackend factory option.** I added the wasm-level
   machinery (`setExtraEnvImports`) and the bridge but didn't add a
   `Barretenberg.new({ msm: 'webgpu' })` toggle. Hooking that in
   touches `bb_backends/` and the BackendOptions surface — a small
   ergonomic improvement once the rest of the chain runs.

## How to verify each layer right now

```bash
# 1. WGSL inliner generates the expected file
cd /mnt/user-data/suyash/ap-webgpu/barretenberg/ts
node src/msm_webgpu/scripts/inline-wgsl.mjs
# → should print "Wrote .../shaders.ts with 28 shaders."

# 2. Bridge protocol test passes (after `yarn install`)
yarn jest src/msm_webgpu/bridge/protocol.test.ts

# 3. C++ hook compiles into a WebGPU-enabled WASM
cd ../cpp
cmake -DCMAKE_TOOLCHAIN_FILE=cmake/toolchains/wasm32-wasi.cmake \
      -DBBERG_WEBGPU_MSM_HOOK=ON -B build-webgpu
cmake --build build-webgpu --target barretenberg.wasm
# → produces a WASM with bb_external_msm_bn254 / bb_publish_srs_bn254
#   as undefined imports. Verify with:
wasm-objdump -x build-webgpu/.../barretenberg.wasm | grep bb_external_msm
```

## Risks called out in the plan, re-checked against the implementation

| Plan §7 risk | Status in this branch |
|---|---|
| SRS shape (uniform across callers) | `webgpu_msm_hook.cpp` publishes the largest span seen on first call, falls back to cold-upload for shorter prefixes. Acceptable until a profile shows otherwise. |
| Cross-origin isolation in playground | COOP/COEP headers already present in `playground/vite.config.ts:106-108`. |
| Result Montgomery conversion | `webgpu_msm_hook.cpp` uses `BaseField(uint256_t)` ctor which auto-converts into Montgomery; `static_cast<uint256_t>(field)` reverses. Verified by reading [field_declarations.hpp:89](barretenberg/cpp/src/barretenberg/ecc/fields/field_declarations.hpp#L89). |
| Scalar Montgomery state at call site | Hook is called from inside `batch_multi_scalar_mul` between the existing pre/post Montgomery pre-passes, so scalars are in canonical form when we see them. Matches what `compute_bn254_msm_*` expects. |
| n threshold | Not yet implemented — see #7 above. |
