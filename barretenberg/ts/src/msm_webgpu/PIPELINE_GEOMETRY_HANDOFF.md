# Handoff: one WebGPU program for any N (kill per-(n,c) pipeline compilation)

**Goal:** the `MsmV2` pipelines should be compiled **once** and reused for every MSM
size, the way the arena work already made the *buffers* size-agnostic. Today they are
not: ~14 shaders bake geometry (`BW`/`stride`/`redM`/`numWindows`) into the WGSL at
`create()`, so each distinct `(n, c)` produces different WGSL and a fresh
`createComputePipeline`. That per-size compilation is the cold-start tax.

## Evidence it's real (measured, M4 Pro, ECDSA-r1 transfer prove)

From the per-MSM CSV (`msm-cpu-vs-gpu.csv`, see `MSM_CPU_VS_GPU_REPORT.md`): the
**first** MSM of each size pays compile, later same-size MSMs don't:

```
W_L#0               n=88899   gpu=293 ms     W_R#1 (same n) = 25 ms
LOOKUP_READ_COUNTS#17  n=36863   gpu=144 ms     LOOKUP_READ_TAGS#18 = 20 ms
```

Across one prove that is ~2.1 s of pipeline compilation over ~17 first-touch sizes
(the bridge audit: `cold=2100ms/17`). It amortizes across a warm multi-prove session
(pipelines are pool-cached), so it mainly hurts the **first** prove — but eliminating
it removes ~2 s from a cold prove and is the last piece of "the GPU program is
size-independent."

## Root cause (grounded in the code)

`MsmV2.create()` (`msm_v2.ts`, the `gen_*_shader(...)` block, grep `gen_ba_` /
`gen_transpose_`) passes geometry into the shader generators. The pool's
`PipelineCache.getPipeline(code, layout, key)` is keyed on the **WGSL string**, so
different geometry → different string → recompile. The specialized generators:

```
gen_ba_stream_walker_shader(TPB, S, BW, stride, redM, INV)     ← const BW/STRIDE/REDM
gen_ba_size1_shader(BW, stride, redM)                          ← const BW/STRIDE/REDM
gen_ba_walker_combine_filter_shader(256, BW, stride, redM)
gen_ba_walker_combine_batched_shader(TPB, S, BW, stride, redM, INV)
gen_ba_walker_combine_{count,scatter,sort_count,sort_scatter}_shader(256, BW)
gen_ba_walker_pt_{init_scan,init_copy,finalize}_shader(.., BW, [stride, redM])
gen_transpose_count_tiled_shader(256, min(BW, 8192))           ← {{ tile }} WORKGROUP ARRAY
gen_transpose_scatter_tiled_shader(256, min(BW, 8192))         ← {{ tile }} WORKGROUP ARRAY
gen_transpose_scatter_tiled_upper_shader(256, min(BW, 8192))   ← {{ tile }} WORKGROUP ARRAY
gen_transpose_scan_shader(numWindows)                          ← verify: loop bound or array?
gen_ba_reduce_level_bench_shader(REDUCE_WG, INV, ADDSUB)       ← REDUCE_WG only (few c values)
```

## Two categories — and the fix for each

**Category A — geometry as a `const` used for indexing / loop bounds (the majority).**
e.g. `ba_stream_walker.template.wgsl` / `ba_size1.template.wgsl`:
```wgsl
const BW:     u32 = {{ bw }}u;
const STRIDE: u32 = {{ stride }}u;
```
These are NOT workgroup-array sizes — they index buffers and bound loops, which WGSL
allows to be **runtime values**. **Fix:** move them out of the WGSL into the `params`
uniform each of these kernels already binds (the `batch_offset` / window-desc uniform —
grep `batch_offset` / `cparams` / `convActiveParams`). Replace `const BW = {{bw}}u;`
with `let BW = params.bw;` (or read from the existing window-desc/params). One WGSL
string → one pipeline → cache hit for every `(n, c)`.

**Category B — geometry that sizes a `var<workgroup>` array (must stay compile-time).**
Only `{{ tile }} = min(BW, 8192)` in `transpose_count_tiled` / `transpose_scatter_tiled`
(+`_upper`):
```wgsl
var<workgroup> hist: array<atomic<u32>, {{ tile }}>;   // tile = min(BW, 8192)
```
WGSL workgroup-array lengths must be constant. **Fix:** size it to the **worst case
(8192) unconditionally** so the WGSL is geometry-independent (one pipeline). The extra
workgroup memory for smaller `BW` is unused and harmless — but check the Apple
workgroup-storage budget (16 KB/threadgroup; `array<atomic<u32>, 8192>` = 32 KB ⇒ TOO
BIG, so the current code already caps at 8192 *and* relies on `BW ≤ 8192` for the
common path). So Category B needs care: either (a) keep a SMALL fixed number of
tile-size variants (e.g. 2: ≤2048 and ≤8192) instead of one-per-`BW` — already a
~10× cut in variants — or (b) restructure the transpose to tile in fixed-size chunks
independent of `BW`. Start with (a): round `tile` UP to the next power-of-two bucket so
only a handful of distinct values ever occur. Confirm the 16 KB budget per chosen size.

`gen_transpose_scan_shader(numWindows)`: **verify first** whether `numWindows` sizes an
array or just bounds the scan loop. If a loop bound → Category A (uniform). If an array
→ Category B (cap to max windows = `VAR_WINDOW_MAX_WINDOWS`).

## Approach, in order

1. **Inventory:** for each generator above, open its `.template.wgsl` and classify every
   `{{ … }}` substitution as A (indexable/loopable → uniform) or B (array size → cap).
   The `const X = {{x}}u;` ones are all A. The `array<…, {{x}}>` ones are B.
2. **Category A first (biggest win, lowest risk):** route `BW`/`stride`/`redM`/window
   geometry through the params/window-desc uniform the kernel already binds. The values
   are already known at `prepare()` time and written to those uniforms — you're deleting
   the compile-time copy, not adding new data. Regenerate (`inline-wgsl.mjs`!),
   golden-validate after EACH kernel (byte-identical is the bisection lever).
3. **Category B:** power-of-two-bucket the `tile`/array sizes so the variant count drops
   from ~one-per-size to ~2–3 total. Re-check the Apple 16 KB workgroup budget.
4. **Re-measure:** the first-touch GPU times in the CSV should fall to the warm number
   (e.g. `W_L#0` 293 ms → ~25 ms), and the bridge audit `cold=…` should collapse.

## Hard rules / traps (do not skip)

- **WGSL is inlined at build.** After editing ANY `*.template.wgsl` run
  `node src/msm_webgpu/scripts/inline-wgsl.mjs` (regenerates `wgsl/_generated/shaders.ts`)
  BEFORE benching, or you run the stale shader. This has caused silent wrong results.
- **Byte-identical is the bisection lever.** `const→uniform` must be value-identical.
  Validate after every kernel: `bash ~/localclaudebox/msm-arena-validate.sh 5210`
  (golden logN 14–17) **and** `?autorun=msm-bridge-e2e&logns=14,16,17` (real host,
  union≡oracle incl. srsOffset groups + profile E). Both must stay byte-identical.
- **Workgroup arrays can't be runtime-sized** (WGSL spec) — that's Category B; don't try
  to make `{{ tile }}` a uniform.
- **WGSL `override` constants** are an alternative for array sizes — they create cheaper
  pipeline *variants* (no WGSL re-parse) but Dawn may still compile per-variant, so
  worst-case/bucketed sizing (no variant) is the surer win. Measure if unsure.
- **`PipelineCache` is per-pool, keyed by WGSL string.** Once a shader's WGSL is
  geometry-free, all `(n,c)` share one compile automatically — no cache change needed.

## Validation that it worked

Re-run the per-MSM crossover (the harness already exists, see below) and check the
**first** MSM of each size no longer spikes:
```
MSM_CSV_OUT=/tmp/x.csv ... jest -t 'captures per-MSM' src/chonk_browser_webgpu_bench.test.ts
# success: gpu_ms for #0-of-each-size ≈ the warm same-size number (no ~150-290ms spike)
```
And the cold first-prove on/off ratio (`-t 'reports wall-time delta'`) should improve
by ~the removed compile (~2 s) on prove #1.

## Current state / how to build + measure (this is set up, reuse it)

- **Branch** `msm-arena-rewrite` (pushed). Session commits: dead pair-tree planning
  removal (`prepare()` 1010→23 ms), srsOffset grouping (engagement 23→100%),
  batch-size-aware small-MSM delegation (`#4`, runtime knob), and this CSV crossover
  harness + report.
- **Hook-WASM with the bridge:** prebuilt at
  `barretenberg/cpp/build-wasm-h4/bin/barretenberg.wasm.gz` (configured with
  `-DBBERG_WEBGPU_MSM_HOOK=ON`, `WASI_SDK_PREFIX=/opt/homebrew/wasi-sdk`, compiler/
  sysroot overridden on the cmake line because the preset hardcodes `/opt/wasi-sdk`).
  Rebuild incrementally: `ninja -C build-wasm-h4 barretenberg.wasm` (~5 min link). You
  only need to rebuild the WASM if you touch C++; **the pipeline-geometry work is pure
  `.wgsl` + `msm_v2.ts`/`shader_manager.ts`, NO C++/WASM rebuild** — iterate with
  `build:esm` + `build:browser` (stage `build-wasm-h4`'s gz into
  `dest/browser/barretenberg_wasm/`) + `yarn webpack` in `yarn-project/ivc-integration`.
- **Fast inner loop for byte-identical:** vite already serves this worktree on :5210
  (`yarn dev:msm-webgpu --port 5210`); golden + `msm-bridge-e2e` run against source via
  HMR (no build). Use that to validate each kernel before the full prove.
- **The full prove harness** (`chonk_browser_webgpu_bench.test.ts`): reuses the pinned
  `ecdsar1+transfer_1_recursions+sponsored_fpc` inputs (symlinked from
  `~/aztec-packages/.../example-app-ivc-inputs-out`). `-t 'reports wall-time delta'` =
  off/on prove; `-t 'captures per-MSM'` = the CPU-vs-GPU CSV.
- **`#4` default** ships ON (`wasm.ts` BD_K=2, small=512). Per the report, that's the
  WRONG predictor (routes by `n`, not density); a separate follow-up is to gate
  delegation on estimated CPU cost (≈ nonzero scalar count ≳ 20k) instead.
- **Git wart:** commit `624f02b` accidentally recorded `webgpu_msm_hook.cpp` as deleted
  (a `clang-format-20`-not-installed pre-commit hook emptied the staged file); it was
  restored in `df5c8eb` (`--no-verify`). The intermediate commit won't compile alone —
  squash `624f02b`+`df5c8eb` before merge, and commit C++ with `--no-verify` (or install
  clang-format-20) until that hook is fixed.

## Reference

- `STREAM_WALKER_PLAN.md` / `ARENA_LAYOUT.md` — the arena/buffer design (the buffer side
  of "size-independent", already done). This handoff is the *pipeline* side.
- `BRIDGE_WIRING_HANDOFF.md` — the bridge + union path (validated, byte-identical).
- `MSM_CPU_VS_GPU_REPORT.md` + `msm-cpu-vs-gpu.csv` — where the cold-start numbers came
  from and the broader CPU-vs-GPU crossover.
