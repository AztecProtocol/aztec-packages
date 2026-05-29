# No-GPU MSM verification (SwiftShader + noble)

Lets you cross-check the WebGPU MSM on a machine with **no GPU and no
barretenberg WASM build** (e.g. CI containers). The WebGPU side runs on
Chrome/Dawn over SwiftShader's Vulkan ICD; the CPU oracle is `@noble/curves`'
bigint Pippenger instead of the WASM multithreaded backend.

## Prerequisites

- A Chromium build with a SwiftShader Vulkan ICD next to it. The Playwright
  bundle ships one:
  - `CHROMIUM_PATH=/opt/ms-playwright/chromium-<rev>/chrome-linux/chrome`
  - `VK_ICD_FILENAMES=/opt/ms-playwright/chromium-<rev>/chrome-linux/vk_swiftshader_icd.json`
- `VK_ICD_FILENAMES` is **required** — without it Dawn finds no Vulkan adapter
  and `requestAdapter()` returns null even though the flags are correct.

## Run

```bash
cd barretenberg/ts
yarn install            # vite + playwright-core
yarn dev:msm-webgpu --host 127.0.0.1 --port 5173   # terminal 1

# terminal 2
export CHROMIUM_PATH=/opt/ms-playwright/chromium-1148/chrome-linux/chrome
export VK_ICD_FILENAMES=/opt/ms-playwright/chromium-1148/chrome-linux/vk_swiftshader_icd.json
node dev/msm-webgpu/drive-swiftshader.mjs \
  'index.html?coi=1&autorun=msm-noble-check&logn=10'
```

`msm-noble-check` (added in `main.ts`) runs the WebGPU MSM and compares the
result against the noble CPU reference, printing `[noble] matches GPU` /
`[noble] mismatch` and a terminal `[autorun] state=done|error`. Keep `logn`
≤ ~14: noble's Pippenger is slow at large n. The standard `msm-cross-check`
autorun still uses the WASM backend and requires a built
`barretenberg-threads.wasm.gz`.

The first run GPU-decompresses the SRS (~18 s on SwiftShader) and caches it to
IndexedDB; subsequent runs skip that. Building `MsmV2` on SwiftShader takes
~30 s (shader compile), so allow a generous timeout.
