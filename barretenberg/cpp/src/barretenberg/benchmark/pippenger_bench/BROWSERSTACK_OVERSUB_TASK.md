# Task: BrowserStack oversubscription-factor sweep for Pippenger

**For an agent with BrowserStack access (real V8, device matrix).** Native benching is done and is
inconclusive *by construction* (explained below); the deciding data can only come from real V8 on
constrained-core devices.

## The decision this resolves

The Pippenger MSM picks its window size `c` using a logical-thread count that is
`get_num_cpus() * window_bits_tuning_oversub_factor(n_input)`. The factor is **up to 4×**
(native: always 4×; wasm: 1/2/4 by input size). This deliberately requests **more logical threads
than physical cores** — the exact "more threads than workers / work goes sequential" pattern flagged
in prior V8 profiling. The factor was co-tuned with the (now-rejected) generation thread pool; the
shipping pool is now `mutex`. We need the oversubscription factor that is best — or at least not
harmful — for the **mutex pool on real devices**, especially **low-core** ones.

## What is already established

| Platform | Result |
|---|---|
| **Native** (EC2, 192 physical cores, HC=8, mutex pool, 5 reps) | oversub ∈ {1, 2, 4} all within ±2% — a **non-factor**. |

**Why native is inconclusive (not just "no effect"):** the bench box has 192 physical cores. At
`HARDWARE_CONCURRENCY=8`, even 4× oversubscription is 32 logical threads on 192 cores — it never
*actually* oversubscribes relative to hardware, so there is no contention to expose. The failure
mode (oversubscription → scheduler thrash → sequential collapse) only appears when **logical threads
exceed physical cores**, e.g. a 4-core phone at 4× = up to 32 threads contending for 4 cores. Only a
low-core device under real V8 can surface this. Native cannot, regardless of how clean the numbers are.

## The exact question

For the Pippenger MSM under the **mutex** pool, on each BrowserStack device class (especially
low-core mobile):

1. Which oversubscription factor (1, 2, or 4) is fastest?
2. Is 4× (the current default) ever **negative** vs 1× or 2× — i.e. does oversubscription cause a
   regression on constrained devices?
3. Does the best factor depend on device core count (so the policy should be core-count-aware,
   not a fixed constant)?

Scope is the **standalone pippenger microbench only** — no full chonk flow.

## How to set the factor

A runtime override exists: **`BB_MSM_OVERSUB=<n>`** in `window_bits_tuning_oversub_factor()`
(`barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp`), read once.
`0`/unset → the built-in default (1/2/4); any positive `n` → that constant.

**Critical wrinkle (same as the pool task):** environment variables do **not** reach a browser-run
wasm module. `BB_MSM_OVERSUB` works for native/wasmtime but **not** in-browser as-is. To sweep
in-browser:

- **(preferred) build-time constant**: add a compile define (e.g. `-DBB_MSM_OVERSUB_FIXED=<n>`) that
  forces the factor at build time, and produce one wasm artifact per value. Small addition to
  `window_bits_tuning_oversub_factor()` — gate the return on the macro before the size-based default.
- **(alternative) harness injection**: thread the value through the browser harness if it can set a
  startup config the wasm reads.

Build 3 wasm artifacts (oversub = 1, 2, 4). The pool must be **mutex** in all of them (the shipping
default) — either via the build-time pool default or whatever mechanism fixes the pool for the
browser build.

## Workload — microbench only

The `PippengerSparsity` cases in `pippenger.bench.cpp` — 2 scalar profiles × dyadic sizes
2^15..2^19:

- `Dense80`: 80% random nonzero, 20% zero (dedup off).
- `DupHeavy`: 50% unique / 25% dup A / 5% dup B / 20% zero (dedup on).

The bench re-seeds a deterministic RNG per (profile, size), so every repetition and every oversub
build sees **byte-identical scalars** — the sweep is properly paired, no input-variance noise.

## Method

- **Run at the device's natural core count AND at `HARDWARE_CONCURRENCY=8`.** The natural core count
  is the realistic case; HC=8 ties back to the native/wasmtime numbers. The interesting regime is
  where oversub × cores produces many more threads than the device has — i.e. low-core devices.
- ≥5 repetitions; median + stddev per (device, oversub, size, profile). Only trust deltas clearing
  the stddev band — V8/browser variance is high.
- Drop the first (warmup) run; V8 tiers Liftoff → TurboFan and `memory.grow` deopts skew run 1.

## Decision rule

- 4× ties or wins everywhere → keep the current default.
- 4× regresses on low-core devices while 1× or 2× is faster there → the factor is **negative on
  constrained devices**; make the policy **core-count-aware** (e.g. cap oversubscription so logical
  threads ≤ k × physical cores for small core counts), or lower the default on wasm.
- best factor varies by device with no clean core-count rule → report the per-device optimum so the
  policy can be set from the device profile.

## Deliverables

1. Per-device table: oversub × size × profile median±stddev, at the device's core count and at HC=8.
2. Whether 4× is ever negative, and on which device classes (with core counts).
3. A recommended policy: fixed factor, or a core-count-aware rule (and the rule).

## Reference

- Factor: `window_bits_tuning_oversub_factor()` in `scalar_multiplication.cpp`; consumed at the
  `num_logical_threads_for_c = get_num_cpus() * window_bits_tuning_oversub_factor(n_input)` site.
- Override: `BB_MSM_OVERSUB` (native/wasmtime); for browser, add `-DBB_MSM_OVERSUB_FIXED` per note above.
- Pool: must be `mutex` (the shipping default; the generation pool was rejected on real V8). Selected
  via `BB_PARALLEL_POOL=mutex` natively, or a build-time pool default in the browser build.
- Microbench: `pippenger.bench.cpp`, `PippengerSparsity` (`{profile 0|1} × {2^15..2^19}`).
- WASM build: `cmake --preset wasm-threads && cmake --build --preset wasm-threads --target pippenger_bench`.
