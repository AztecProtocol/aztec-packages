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
