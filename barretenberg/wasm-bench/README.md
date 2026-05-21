# wasm-bench

Browser harness for benchmarking and profiling Chonk proving against the wasm bb binary.

## Why this exists

`bb.js` ships a full client SDK on top of the wasm bb binary: Comlink workers, the
`AztecClientBackend` / `UltraHonkBackend` wrappers, a generated msgpack layer, and the
browser/node/cjs build matrix. This package uses a thin WASI-threads worker pool and a small
standard-bbapi wrapper. The browser decodes `ivc-inputs.msgpack`, inflates bytecode/witness
bytes, and drives `ChonkStart` / `ChonkLoad` / `ChonkAccumulate` / `ChonkProve` through `bbapi`.

Concrete wins:

- `?threads=N` actually passes `N` to the wasm — no `navigator.hardwareConcurrency` clamp. Default is `auto`, which reads `navigator.hardwareConcurrency` from the runtime device. The harness never inserts a low-thread smoke run on its own.
- Optional Perfetto trace capture via `BenchEnableTrace`; BB_BENCH aggregate timing is collected
  even when traces are off.
- `proveTotalMs = chonk_setup + chonk_prove` is the headline proving-time metric.
- Phase-by-phase timing (`fetchWasmMs`, `inputDecodeMs`, `init_wasm`, `enable_bench`,
  `chonk_setup`, `chonk_prove`, `bench_dump`, `destroy`) so the wall-time delta beyond `proveMs` is
  legible, not residual.
- Cold-start progress rows are printed to the runner log: BrowserStack launch, page JS start,
  worker startup, wasm gzip fetch, browser-native gzip decode/compile, input fetch, CRS fetch,
  setup, and prove.
- CRS bytes are served from the local CRS directory populated by `barretenberg/crs/bootstrap.sh`.

## Build

```bash
# 1. wasm bb binary with BB_BENCH support (required for breakdown / trace)
cd barretenberg/cpp
cmake --preset wasm-threads -DENABLE_WASM_BENCH=ON
cmake --build --preset wasm-threads --target barretenberg.wasm.gz

# 2. CRS + pinned inputs
cd ../..
barretenberg/crs/bootstrap.sh
barretenberg/cpp/scripts/chonk_inputs.sh download

# 3. wasm-bench bundle.
cd barretenberg/wasm-bench
./bootstrap.sh
```

## Run locally

```bash
yarn serve --port 8089 [--download-pinned] [--crs-dir "$HOME/.bb-crs"]
# COOP/COEP headers set by the server; SharedArrayBuffer required for wasm-threads.
```

Then visit `http://localhost:8089/?flow=ecdsar1+transfer_1_recursions+sponsored_fpc&threads=16`.

## Run on BrowserStack

The harness POSTs results to `/results` (appends one JSONL row to
`/tmp/wasm-bench-results.jsonl`) and, when `?trace=1`, writes the Perfetto trace bytes via
`POST /trace` to `/tmp/wasm-bench-traces/trace-<flow>-<run>.perfetto.json`.

Use the CI runner script for the real BrowserStack path. It starts the local server, opens
the target-appropriate BrowserStack Local connection, runs one target, collects JSONL,
optional Perfetto traces, progress logs, asset timings, and writes
`bench-out/<target>-<flow>.bench.json`.

```bash
BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... \
  ./scripts/run-ci-bench.sh windows-chrome ecdsar1+transfer_1_recursions+sponsored_fpc 1
```

For the fastest cold-start check, use smoke mode. It still launches BrowserStack, runs the
page, verifies COOP/COEP + `SharedArrayBuffer`, starts the worker, fetches and compiles
`barretenberg.wasm.gz` through browser-native gzip handling, and fetches the input file, but
skips `chonk_setup` and `chonk_prove`.

```bash
BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... WASM_BENCH_SMOKE=1 WASM_BENCH_TRACE=0 \
  ./scripts/run-ci-bench.sh windows-chrome ecdsar1+transfer_1_recursions+sponsored_fpc 1
```

For a real developer profiling loop, run one target with traces off:

```bash
BROWSERSTACK_USERNAME=... BROWSERSTACK_ACCESS_KEY=... WASM_BENCH_TRACE=0 \
  ./scripts/run-ci-bench.sh windows-chrome ecdsar1+transfer_1_recursions+sponsored_fpc 1
```

The root `ci-wasm-bench` mode used by the PR label sets `WASM_BENCH_PLATFORMS=all`
by default, so labeled CI reports on the full eight-target catalogue. Use
`WASM_BENCH_PLATFORMS=windows-chrome` for a single-target CI debug run,
`WASM_BENCH_PLATFORMS=default` for the customer/availability-balanced core,
`WASM_BENCH_PLATFORMS=customer-balanced` for broader Automate-only review coverage, or
`WASM_BENCH_PLATFORMS=all` for explicit full catalogue parity outside labeled CI.
Labeled CI continues after individual target allocation/proving failures so the dashboard
can show a complete eight-target report.
Use `WASM_BENCH_BENCHMARK=<config-key>` and `WASM_BENCH_FLOWS=<flow>[,<flow>]` to run a
different configured benchmark/flow. Non-default benchmarks write isolated artifacts under
`bench-out/<target>-<benchmark>`.

Default matrix:

| Target | Runtime |
|---|---|
| `windows-chrome` | Windows 11 Chrome on BrowserStack Win64 x64 desktop VM; CPU model not exposed by BrowserStack |
| `iphone-15-pro` | iPhone 15 Pro Safari |

Named matrix profiles:

| Profile | Targets | Use |
|---|---|---|
| `default` / `core` | `windows-chrome`, `iphone-15-pro` | Fastest representative proof signal. |
| `customer-balanced` | `windows-chrome`, `iphone-15-pro`, `macos`, `windows-edge` | Broader review pass across customer-weighted desktop/mobile surfaces while keeping the run short. |
| `all` / `extended` | Full catalogue | Explicit broad coverage across all configured Automate targets. |

Extended target catalogue:

| Target | Runtime |
|---|---|
| `macos` | macOS Sequoia Chrome on BrowserStack's Apple M2 Mac mini |
| `windows-edge` | Windows 11 Edge on BrowserStack Win64 x64 desktop VM; CPU model not exposed by BrowserStack |
| `iphone-16` | iPhone 16 Safari |
| `galaxy-s25-ultra` | Samsung Galaxy S25 Ultra Android Chrome |
| `galaxy-s25` | Samsung Galaxy S25 Android Chrome |
| `pixel-9-pro-xl` | Google Pixel 9 Pro XL Android Chrome |

The default matrix is intentionally smaller than the full catalogue. It covers the dominant
desktop browser path and iOS Safari from the customer-survey weighting while avoiding
targets that showed BrowserStack allocation/page-start flakiness in local proof runs.
`customer-balanced` adds macOS Chrome and Windows Edge for a broader human review pass
without bringing in the full mobile catalogue. Use explicit targets or
`WASM_BENCH_PLATFORMS=all` when a reviewer needs the whole catalogue.
Default targets also use short BrowserStack session-create budgets; if BrowserStack cannot
allocate one quickly, the run fails fast instead of spending several minutes proving
availability is bad.

Targets use BrowserStack Automate so navigation failures are explicit and diagnosable.
iOS Safari rewrites BrowserStack Local localhost URLs to `bs-local.com`, so the
iPhone preset serves the harness at `https://bs-local.com:8443` with a short-lived local
certificate and passes `--https-ports 8443` to BrowserStack Local. The runner drives iOS
through BrowserStack Automate so it can execute BrowserStack's `acceptSsl` command before
Safari runs the benchmark; after that the page is a secure origin and
`crossOriginIsolated` / `SharedArrayBuffer` are enabled without a public tunnel.
Mobile presets may use `"os_version": "latest"` in `wasm-bench.config.json`; the runner
resolves that through BrowserStack's `/automate/browsers.json` inventory to the latest OS
currently available for the configured device/browser pair before creating the session.

When the run completes the JSONL row contains:

```jsonc
{
  "payload": {
    "ok": true,
    "data": {
      "flow": "...",
      "preamble": { "fetchWasmMs": ..., "fetchInputsMs": ... },
      "runs": [
        {
          "run": 1,
          "configuredThreads": 16,
          "phases": {
            "init_wasm": ..., "enable_bench": ..., "chonk_setup": ...,
            "chonk_prove": ..., "bench_dump": ..., "destroy": ...
          },
          "proveMs": ..., "setupMs": ..., "wallMs": ...,
          "proofFieldCount": ...,
          "benchDump": { /* BB_BENCH hierarchical breakdown */ },
          "traceBytes": ..., "hadTrace": true
        }
      ],
      "coldStart": {
        "mainBundleLoadedMs": ...,
        "fetchWasmHeadersMs": ...,
        "fetchWasmMs": ...,
        "wasmGzipBytes": ...,
        "wasmBytes": ...,
        "compileStreamingMs": ...,
        "compileWasmMs": ...,
        "inputBytes": ...
      },
      "features": { /* userAgent, hardwareConcurrency, COI, SAB, simd */ }
    }
  }
}
```

The CI log also prints `WASM_BENCH_RUNNER`, `/progress`, and `WASM_BENCH_ASSET` rows. These
are intentionally high level so an operator or AI session can see where cold start went
without downloading artifacts.

CI enables `WASM_BENCH_TRACE=1` by default and publishes the full `bench-out` tree to
the rkapp BrowserStack dashboard:

```text
http://ci.aztec-labs.com/wasm-bench?run=<commit>
```

That page is the primary review surface for BrowserStack wasm data. It shows
`proveTotalMs`, phase timing, cold-start timing, BB_BENCH wall-time hotspots, progress
timelines, runtime capabilities, and Perfetto trace links. The lifecycle matrix breaks
out harness and run inefficiency: main bundle load, worker boot, wasm headers,
wasm stream/compile, input fetch/decode, bb init, CRS/SRS, trace/report, cleanup, and
other worker-run time. BB_BENCH threaded scopes are shown by effective wall time:
threaded entries use `time_max` rather than summed worker time.

CI uploads the dashboard artifact subset from `barretenberg/wasm-bench/bench-out` to
the `logs/bench/wasm-bench/<commit>/` rkapp prefix. It also uploads the full tree to the
`wasm-bench-artifacts-<tree-hash>.tar.gz` cache. The artifact includes
`trace-manifest.json` and `trace-manifest.md`, which list the dashboard URL, every trace
path, size, target, flow, thread count, and `proveTotalMs`. Download it with:

```bash
./ci.sh gh-wasm-bench-artifacts
```
