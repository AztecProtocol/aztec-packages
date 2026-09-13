# Barretenberg Wasm Bench

Minimal direct-wasm browser harness for Chonk proving. It loads
`barretenberg.wasm.gz` directly, talks to the `bbapi` msgpack export, and runs
pinned `ivc-inputs.msgpack` flows without going through `@aztec/bb.js` or the
`acir_tests/browser-test-app` bundle.

## Build

```bash
cd barretenberg/cpp
AVM=0 AVM_TRANSPILER=0 cmake --preset wasm -DAVM=OFF -DAVM_TRANSPILER_LIB= -DENABLE_WASM_BENCH=ON
AVM=0 AVM_TRANSPILER=0 cmake --build --preset wasm --target barretenberg.wasm.gz -j 8
AVM=0 AVM_TRANSPILER=0 cmake --preset wasm-threads -DAVM=OFF -DAVM_TRANSPILER_LIB=
AVM=0 AVM_TRANSPILER=0 cmake --build --preset wasm-threads --target barretenberg.wasm.gz -j 8

cd ../wasm-bench
yarn install
yarn build
```

## Serve Locally

```bash
cd barretenberg/wasm-bench
yarn serve -- --port 8090
```

Open `http://127.0.0.1:8090/index.html?bench=<base64url-json>` or use the
default UI button. The server writes progress and result JSONL when
`--progress-jsonl` and `--result-jsonl` are supplied.

## One-Off Links

The package does not run BrowserStack directly. It creates one-off bench links
and BrowserStack `/5/worker` JSON that bots can publish or pass to the
BrowserStack MCP tools.

```bash
cd barretenberg/wasm-bench
yarn create-link \
  --url https://<tunnel>.trycloudflare.com \
  --matrix customer-balanced \
  --html /tmp/wasm-bench-links.html \
  --json /tmp/wasm-bench-links.json \
  --format json
```

Publish the HTML and JSON with `cloxy-gist`, then post the raw HTML file through
an HTML preview link:

```bash
cloxy-gist --description "wasm bench links" \
  bench-links.html=/tmp/wasm-bench-links.html \
  bench-links.json=/tmp/wasm-bench-links.json

yarn create-link \
  --url https://<tunnel>.trycloudflare.com \
  --matrix customer-balanced \
  --gist-raw-url https://gist.githubusercontent.com/<id>/raw/bench-links.html
```

The generated JSON includes `targets[].benchUrl` and
`targets[].browserstackWorker`. Pass the worker JSON directly to
`browserstack_create_worker` when driving a target from claudebox. The headline
metric for completed prove results is:

```text
proveTotalMs = chonk_setup + chonk_prove
```

List supported targets:

```bash
yarn create-link --target true
```

## Paired A/B (statistically meaningful PR vs base)

For "is PR X faster than base?" comparisons, single-run timings on a shared
device are noise — between-run variance on a BrowserStack mobile/desktop
worker swamps anything under ~5%. The harness ships a paired A/B mode that
runs both variants on the same physical worker in alternating order:

1. Build the wasm for both sides (e.g. `barretenberg.wasm.gz` for PR head and
   merge-base). Either of `cmake --preset wasm-threads -DENABLE_WASM_BENCH=ON`
   variants is fine — just two separate output files.
2. After `yarn build`, lay them both out under `dest/wasm/<variant>/`:

   ```bash
   yarn build-ab \
     --variant pr=path/to/pr/barretenberg.wasm.gz \
     --variant base=path/to/base/barretenberg.wasm.gz
   ```

   For an A==B harness validation run, pass the same wasm for both variants;
   the generated `variants.manifest.json` reports identical md5s and the
   ground-truth Δ should bracket zero.
3. Drive the worker with `bench` params:

   ```json
   {
     "benchmark": "chonk-ab",
     "flow": "ecdsar1+transfer_1_recursions+sponsored_fpc",
     "threads": "auto",
     "pairs": 11,
     "warmupPairs": 1,
     "variants": ["pr", "base"],
     "wasmBaseUrls": { "pr": "/wasm/pr", "base": "/wasm/base" }
   }
   ```

   The first pair is dropped from analysis (caches/JIT warm-up). Order
   alternates every pair so PR-first and base-first counts are balanced.
4. Post-collection, run the analyzer:

   ```bash
   yarn analyze-ab --result /tmp/wasm-bench-results.jsonl
   ```

   It reports per-variant `n / median / mean / stddev / min / max`, per-pair
   Δ summary, seeded bootstrap 95% CI on the median Δ (both ms and %), and
   a Wilcoxon signed-rank test on the paired deltas. Verdict is
   `significant` if and only if the Δ% 95% CI excludes zero.

`scripts/run-browserstack.mjs` drives the whole loop with watchdogs
(`--stall-ms`, `--deadline-ms`, per-target `firstProgressMs`), when run from
a host that has `BROWSERSTACK_USERNAME` / `BROWSERSTACK_ACCESS_KEY` in env.
From a claudebox session, use the BrowserStack MCP tools instead — the
`bench` param shape is the same.
