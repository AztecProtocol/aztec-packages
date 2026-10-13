---
name: benchmark-chonk-v8
description: Benchmark Chonk (client IVC) WASM proving under Node/V8 via bb.js — the realistic browser/client engine — and A/B two git commits by pointing one bb.js at each commit's wasm build. Covers the laptop iteration loop and the extension to real on-device (phone) measurement. Use when measuring client-side (wasm) proving performance or comparing two commits' wasm proving, especially for the browser/mobile path. For native or wasmtime benchmarking use benchmark-chonk instead.
argument-hint: <action> e.g. "ab <commitA> <commitB>", "run <flow>", "on-device"
---

# Benchmark Chonk under V8 (WASM, the client path)

Runs `AztecClientBackend.prove()` (real, threaded wasm proving) through **bb.js under Node/V8** — the same engine and code path a browser uses (Worker threads + `SharedArrayBuffer`), but scriptable on a laptop. This complements `benchmark-chonk` (native + wasmtime); use this one for the **client/browser/mobile** story and for **A/B-ing two commits' wasm**.

**Why V8/node, not wasmtime:** Chrome and Node share the V8 engine, so Node numbers track Android Chrome. wasmtime is a different runtime; for "what will a client see," V8 is the faithful laptop proxy. (iOS uses a different engine — see Caveats.)

## Drivers

| Driver | Use | Status |
|---|---|---|
| `barretenberg/ts/bb.js/scripts/chonk_wasm_bench.mjs` | Prove the pinned flows with one bb.js build. Env knobs `WASM_BENCH_BACKEND` (wasm/native), `WASM_BENCH_THREADS` (default 16), `WASM_BENCH_ITERS` (default 3; the first iteration is a discarded warmup), `CHONK_PINNED_IVC_FLOW` (flow substring). A/B by running it against two builds. | Current; run it from `barretenberg/ts/bb.js`. |
| `barretenberg/ts/scripts/bench_v8_flow.mjs` + `bench_v8.sh` (this dir) | A/B two commits' `barretenberg.wasm.gz` with one bb.js, through the `wasmPath` option. | Broken: the driver imports `../dest/node/index.js`, i.e. `barretenberg/ts/dest/node`, but bb.js builds to `barretenberg/ts/bb.js/dest/node`. `bench_v8.sh` also uses BSD `/usr/bin/time -l`, so it runs only on macOS (on Linux every row records exit 125). |

The rest of this skill describes the `wasmPath` A/B flow, which is what the two broken scripts implement.

## A/B model: two commits, one driver

The intended comparison is **commit A vs commit B**: build each commit's threaded wasm to a `barretenberg.wasm.gz`, then drive **both** with a single bb.js via the `wasmPath` option.

## Prerequisites

1. **Pinned inputs** (real tx flows; the root `chonk-inputs` skill covers the pin):
   ```bash
   barretenberg/cpp/scripts/chonk_inputs.sh download   # -> barretenberg/cpp/chonk-pinned-flows/<flow>/ivc-inputs.msgpack
   ```
   The pinned hash is per-commit (`barretenberg/cpp/scripts/chonk-inputs.hash`); run `download` from the commit you're proving so the inputs match the VKs (a mismatch fails, e.g. with `AVM recursion constraints not supported with MegaBuilder`).

2. **bb.js (`barretenberg/ts/bb.js/dest/node`)** — provides the JS the driver imports, and its threading shim:
   ```bash
   cd barretenberg/ts && ./bootstrap.sh        # builds bb.js (wasm + dest/node + node_modules), bb-avm-sim and cdb
   ```
   Only needed once; it drives both A and B wasms via `wasmPath`.
   - If `dest/node` already exists but the driver dies with `Cannot find package 'msgpackr'`/`'pako'`, `node_modules` was cleaned — run `yarn install` in `barretenberg/ts`. It can rewrite the tracked `yarn.lock`, because the generated `bb-avm-sim/` and `cdb/` workspaces are gitignored.
   - To rebuild only `dest/node` (e.g. after a checkout) without the full wasm build — you build `barretenberg.wasm.gz` separately below anyway: `cd barretenberg/ts/bb.js && yarn install && BB_BINARY_PATH=<bb> yarn generate && yarn build:esm`.

3. **A `barretenberg.wasm.gz` per commit** — see next section.

## Build each commit's wasm (the A/B inputs)

For each commit, build the threaded wasm in a worktree and stash the gz:
```bash
git worktree add /tmp/wt-A <commitA>
( cd /tmp/wt-A/barretenberg/cpp && cmake --preset wasm-threads \
    && cmake --build --preset wasm-threads --target barretenberg.wasm.gz )
cp /tmp/wt-A/barretenberg/cpp/build-wasm-threads/bin/barretenberg.wasm.gz /tmp/wasm-A.wasm.gz
# repeat for <commitB> -> /tmp/wasm-B.wasm.gz
```
(If A is just your current checkout, build it in place: `cd barretenberg/cpp && cmake --build --preset wasm-threads --target barretenberg.wasm.gz` and use `build-wasm-threads/bin/barretenberg.wasm.gz`.)

## Single flow (smoke / one-off)

```bash
cd barretenberg/ts
VERIFY=1 HARDWARE_CONCURRENCY=8 node scripts/bench_v8_flow.mjs \
  ../cpp/chonk-pinned-flows/ecdsar1+transfer_0_recursions+sponsored_fpc 8 /tmp/wasm-A.wasm.gz
# -> VERIFIED=true / PROVE_MS=<n>   (omit the wasmPath arg to use the packaged dest wasm)
```

## A/B sweep (macOS)

```bash
barretenberg/.claude/skills/benchmark-chonk-v8/bench_v8.sh \
  --hc "4 8" --reps 2 \
  --flows-dir barretenberg/cpp/chonk-pinned-flows \
  --out /tmp/v8ab/results.csv \
  A=/tmp/wasm-A.wasm.gz B=/tmp/wasm-B.wasm.gz
python3 barretenberg/.claude/skills/benchmark-chonk-v8/analyze_v8.py /tmp/v8ab/results.csv --metric prove_ms
```
Contexts run back-to-back per (flow, hc, rep) to cancel thermal drift; the sweep is resumable (re-run to fill gaps). `analyze_v8.py` prints per-HC tables with `Δ` vs the first context and a CV column — trust a delta only when it clears the CV.

## HC mapping (important)

`HARDWARE_CONCURRENCY=N` ⇒ the driver passes `threads: N`. bb.js creates `N-1` Worker threads (the main thread is the Nth), and the wasm's `env_hardware_concurrency` returns `N` — so the C++ sees exactly `N`, matching a native `HARDWARE_CONCURRENCY=N` run. **On a real device, confirm `crossOriginIsolated === true`** or threads silently fall back to 1 and the numbers are meaningless; mobile browsers also cap `navigator.hardwareConcurrency`.

## Metrics

- **`prove_ms`** — internal `performance.now()` around `prove()`. The primary signal (excludes wasm compile + CRS init).
- **`wall_ms`** — whole node process; includes startup/compile.
- **`peak_mb`** — peak RSS via BSD `/usr/bin/time -l` (macOS; reported in bytes, divided to MB). **Noisy and not phone-faithful**: it includes V8 + the whole `WebAssembly.Memory` linear heap. For memory, the host-independent number that predicts the **iOS ~1 GB OOM** is the wasm linear-heap high-water (`wasm.memory.buffer.byteLength`), not RSS — instrument that if memory is the question.

## On-device (real phone) — when laptop V8 isn't enough

Laptop V8 is a faithful proxy for **Android Chrome timing** and for the **memory footprint** (linear heap is host-independent), but **not** for iOS (JSC engine) or for absolute device speed/thermals. For real device numbers you need a browser on the device — but you do **not** need a cloud deploy:

- **Android:** `adb reverse tcp:8080 tcp:8080` makes the phone's `localhost:8080` hit a local static server on your laptop. `localhost` is a secure context, so `SharedArrayBuffer`/threads work with **no HTTPS and no deploy** — rebuild, refresh. Drive/measure via `chrome://inspect` (USB) for `performance.now()` + DevTools memory.
- **iOS:** needs a real secure origin — use an **ephemeral tunnel** (`cloudflared tunnel --url http://localhost:8080` or `ngrok http 8080`) instead of a full deploy. The tunnel exposes your local server publicly while it runs. Measure via Safari **Web Inspector** over USB.
- Serve with **COOP/COEP** headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) — required for cross-origin isolation.
- Reuse the **browser bundle** (`cd barretenberg/ts/bb.js && yarn build:browser`, wasm inlined) + the existing browser harness (`barretenberg/ts/bb.js/src/index.html`, `labs/yarn-project/ivc-integration/src/chonk_browser.test.ts`) rather than hand-rolling a page. Same `AztecClientBackend.prove()` API as the node driver, just the browser build.
- Read `wasm.memory.buffer.byteLength` at peak — the metric that predicts OOM.

## Caveats

- Node/V8 ≈ **Android Chrome** (shared engine); **iOS Safari is JSC** — different engine, different numbers. Confirm iOS separately on-device.
- Laptop hardware ≠ phone: don't quote `prove_ms` as a phone time. The **memory footprint** (wasm linear heap) *does* transfer; absolute timing does not.
- Drive both A/B wasms with one `dest/node` only when their bbapi/cbind ABI matches (nearby commits). bb.js providing an extra import the wasm doesn't use is harmless; a wasm needing an import the bb.js lacks fails to instantiate. If the two commits diverge in bbapi, build `dest/node` per commit and run the driver from each.

## Files

| file | purpose |
|---|---|
| `barretenberg/ts/scripts/bench_v8_flow.mjs` | the `wasmPath` driver — prove one flow under V8/node (see Drivers for its status) |
| `barretenberg/ts/bb.js/scripts/chonk_wasm_bench.mjs` | single-build driver over the pinned flows |
| `bench_v8.sh` (this dir) | N-context A/B sweep over flows × HC × reps; CSV out |
| `analyze_v8.py` (this dir) | summarize the CSV: per-HC tables, Δ vs baseline, CV |
