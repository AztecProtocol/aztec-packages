# Task: BrowserStack pool A/B for the Pippenger thread-pool decision

**For an agent with BrowserStack access (real V8, device matrix).** Everything below has
already been done on native + local wasmtime; the one missing input is real-V8-across-devices,
which only BrowserStack can provide.

## The decision this resolves

The Pippenger MSM rewrite introduced a new **generation-counter thread pool** (`ParallelForPool`
in `barretenberg/cpp/src/barretenberg/common/thread.cpp`), replacing the legacy
`std::mutex`/`condition_variable` pool (`parallel_for_mutex_pool.cpp`) and a lock-free
`parallel_for_atomic_pool.cpp`. We need to decide whether the generation pool ships, and if so
whether it should be the default on WASM, on native, or gated per-device.

## What is already established

| Platform | Result |
|---|---|
| **Native** (EC2, HC=8, 5 reps) | generation ≈ mutex ≈ atomic — all within ±3% (statistical wash). Generation is slightly *jitterier* run-to-run (stddev ~1–3% vs ~0.2–0.5% for the others). No throughput reason to prefer it. |
| **Local wasmtime** (HC=8, 5 reps) | generation is **decisively faster**: +7–35% vs mutex, +6–49% vs atomic, consistent across all sizes and both sparsity profiles. |

**Why BrowserStack is needed:** wasmtime's wasi-threads scheduler is **not** V8. The lost-wakeup
race the generation pool's WASM idle-wait path was written to dodge (see the `__wasm__` branch and
the `i32.atomic.wait` comment in `thread.cpp`) is a **V8-specific** phenomenon. The wasmtime win
is suggestive but does not transfer automatically to browsers. Separately, the report that
the pool "wasn't optimal for some devices" almost certainly came from the BrowserStack device
matrix — different mobile/desktop CPUs, core counts, and V8 builds — which nothing local
reproduces.

## The exact question

For the new Pippenger MSM, on each BrowserStack device class:

1. Does the generation pool beat mutex/atomic (as it does under wasmtime), tie, or **regress**?
2. If it regresses, on **which device classes** (core count, OS, mobile vs desktop)?

Scope is the **standalone pippenger microbench only** — no full chonk flow. The microbench isolates
the pool's effect on the MSM, which is the decision we care about; flow-level numbers are out of scope.

## How to select the pool

The pool is chosen by the **`BB_PARALLEL_POOL`** environment variable, read once at first dispatch
in `thread.cpp::detail::pool_strategy()`:

- unset or any value ≠ below → `generation` (current default)
- `mutex` → legacy mutex/condition_variable pool
- `atomic` → legacy lock-free atomic pool

**Critical wrinkle:** environment variables do **not** flow into a browser-run wasm module
(`process.env` doesn't exist there). So `BB_PARALLEL_POOL` works for native/wasmtime but **not** in
the browser as-is. To A/B in-browser you must do one of:

- **(preferred) build-time default**: add a compile define so the default `PoolStrategy` is fixed
  at build time (e.g. `-DBB_DEFAULT_PARALLEL_POOL=mutex`), and produce one wasm artifact per pool.
  The runtime env override can stay; you're just changing the compiled-in default. This is a small
  addition to `pool_strategy()` — gate the initial value on the macro before the getenv check.
- **(alternative) harness injection**: if the browser test harness can set a wasi env or write a
  value the wasm reads at startup, thread the pool name through that. Heavier and harness-specific.

Recommend the build-time-default route: build 2–3 wasm artifacts (`generation`, `mutex`, and
optionally `atomic`) and run each on the device matrix.

## Workload — microbench only

The `PippengerSparsity` cases in `pippenger.bench.cpp` — 2 scalar profiles × dyadic sizes
2^15..2^19:

- `Dense80`: 80% random nonzero, 20% zero (dedup off).
- `DupHeavy`: 50% unique random / 25% dup A / 5% dup B / 20% zero (dedup on — exercises the
  heavily-threaded Phase A pre-pass, the stage most sensitive to pool dispatch).

The bench re-seeds a deterministic RNG per (profile, size), so every repetition and every pool
build sees **byte-identical scalars** — the A/B is properly paired, no input-variance noise.

## Method

- `HARDWARE_CONCURRENCY=8` to match the native/wasmtime runs already collected. Also run at the
  device's natural core count, since "not optimal for some devices" may be a core-count interaction
  (prior profiling flagged "more threads than workers" / "stuff became sequential").
- ≥5 repetitions; report **median + stddev** per (device, pool, size, profile). WASM/browser
  variance is high — only trust deltas that clear the stddev band.
- Drop the first (warmup) run; V8 tiers up (Liftoff → TurboFan) and `memory.grow` deopts skew run 1.

## Decision rule

- generation wins broadly across devices (like wasmtime) → **ship generation as the WASM default**;
  native default can stay legacy (they tie) or follow suit.
- generation regresses on specific device classes → that's the reported "not optimal for some
  devices". Either **gate per-device** or keep the legacy pool as the WASM default and treat
  generation as opt-in.

## Deliverables

1. Per-device table: pool × size × profile median±stddev (microbench), at HC=8 and native core count.
2. The device classes where each pool wins / loses, with the crossover characterised (core count? OS?).
3. A recommendation: WASM default pool, native default pool, and whether per-device gating is needed.

## Reference

- Pool implementations: `barretenberg/cpp/src/barretenberg/common/thread.cpp` (generation),
  `parallel_for_mutex_pool.cpp`, `parallel_for_atomic_pool.cpp`.
- Toggle: `BB_PARALLEL_POOL` in `thread.cpp::detail::pool_strategy()`.
- Microbench: `barretenberg/cpp/src/barretenberg/benchmark/pippenger_bench/pippenger.bench.cpp`,
  `PippengerSparsity` (registered over `{profile 0|1} × {2^15..2^19}`).
- Native/wasmtime numbers to compare against: see this PR's description.
- WASM build: `cmake --preset wasm-threads && cmake --build --preset wasm-threads --target pippenger_bench`.
  Run via `scripts/wasmtime.sh` locally; for browser, drive the same `pippenger_bench` wasm artifact
  through the BrowserStack harness (per-pool build, see the build-time-default note above).
