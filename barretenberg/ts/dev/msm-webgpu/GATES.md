# Stream-walker correctness gates (test-first)

Runnable §11 gates G1–G5 from `STREAM_WALKER_PLAN.md`, plus a headless
SwiftShader runner so they execute with no real GPU.

## Run

```bash
cd barretenberg/ts
yarn dev:msm-webgpu --host 127.0.0.1 --port 5173        # dev server
node dev/msm-webgpu/drive-swiftshader.mjs \
  'index.html?coi=1&autorun=gates&logn=8'                # G1–G5
```

`drive-swiftshader.mjs` forces SwiftShader's Vulkan ICD. The key detail
that blocked prior sessions: Dawn needs `VK_ICD_FILENAMES` pointing at the
bundled `vk_swiftshader_icd.json`, not just `--use-vulkan=swiftshader`.
The runner sets it automatically. `probe-adapter.mjs` is a fast
adapter-only check (`FLAGS=... node dev/msm-webgpu/probe-adapter.mjs`).

## Gates

| Gate | Kernel under test | Oracle |
|---|---|---|
| G1 | `ba_planner_split_detect` | CPU split-detect from `thread_cuts` (§5.2) |
| G2 | `ba_stream_walker` (logn=8, single bucket) | `cpuReferenceAccumulate` |
| G3 | `ba_stream_walker` (logn=10, no splits) | `cpuReferenceAccumulate` |
| G4 | `ba_stream_walker` + host fixup (logn=10, forced splits) | `cpuReferenceAccumulate` |
| G5 | WebGPU stream-walker | WASM MT MSM (final point) |

G6/G7 require real hardware and are out of scope here.

The CPU oracles (`gates.ts`) run against the **live** planner output read
back by `MsmV2.gateReadback()`. Each gate's GPU side is a hook in
`GateGpuHooks`; until a kernel exists its hook throws `NotImplemented` and
the gate reports **NYI** (RED). Turning a gate green = build the kernel,
then replace its `NOT_IMPLEMENTED_HOOKS` entry with the buffer readback +
the comparison already written in `gates.ts`.

Notes:
- G1–G4 need no WASM (pure CPU oracle vs GPU). Only **G5** needs
  `barretenberg.wasm`; the committed `src/barretenberg_wasm/*.wasm.gz` are
  placeholder text files pointing at `cpp/build-wasm/bin/...`, which must be
  built first.
- G2 as specified uses a crafted single-bucket dataset; the current harness
  uses the planner's natural distribution at the given logn. Crafted-input
  generation is a refinement for when the walker exists.
