---
name: wasm-bench-browserstack
description: Create and publish one-off Chonk direct-wasm benchmark links for BrowserStack real browsers using pinned IVC inputs.
---

# BrowserStack Direct-Wasm Chonk Benchmark Links

Use this skill for BrowserStack, mobile-browser, iOS/Android browser, or wasm
Chonk benchmark requests. The source of truth is `barretenberg/wasm-bench/`.
Do not extend `barretenberg/acir_tests/browser-test-app` for pure benchmark
work; that app is only for SDK/browser correctness coverage.

## Harness

`barretenberg/wasm-bench` is intentionally minimal:

- no `@aztec/bb.js`, no Comlink, no browser-test-app
- bundles three browser modules: UI, benchmark worker, pthread worker
- loads `barretenberg.wasm.gz` or `barretenberg-threads.wasm.gz` directly
- calls the `bbapi` msgpack export for `SrsInitSrs`, `SrsInitGrumpkinSrs`,
  `ChonkStart`, `ChonkLoad`, `ChonkAccumulate`, `ChonkProve`,
  `ChonkComputeVk`, and `ChonkVerify`
- serves pinned `ivc-inputs.msgpack` from
  `yarn-project/end-to-end/example-app-ivc-inputs-out`

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

`yarn build` fails clearly if either wasm artifact is missing. The threaded
preset already enables `ENABLE_WASM_BENCH`; pass it explicitly for the
single-thread preset.

## Link Workflow

Serve the built harness through a public tunnel, then create one-off links:

```bash
cd barretenberg/wasm-bench
yarn create-link \
  --url https://<tunnel>.trycloudflare.com \
  --matrix customer-balanced \
  --html /tmp/wasm-bench-links.html \
  --json /tmp/wasm-bench-links.json \
  --format json
```

The script only creates artifacts. It does not install Selenium, start
BrowserStack Local, or hold BrowserStack credentials in the shell. The JSON is
bot-friendly:

- `targets[].benchUrl` is the one-off `index.html?bench=<base64url-json>` link.
- `targets[].browserstackWorker` is the BrowserStack `/5/worker` request body.
- `html.path`, when supplied, is the HTML page to publish with `cloxy-gist`.

Publish the HTML with `cloxy-gist`, then post the raw gist file through
`https://htmlpreview.github.io/?<raw-gist-html-url>`. To have the script print
that preview URL alongside the bench links, rerun it with `--gist-raw-url`.

List target presets:

```bash
yarn create-link --target true
```

Important target behavior:

- `iphone-15-pro` injects `memMaxPages: 16384` because iOS Safari rejects the
  default 4 GiB shared memory maximum.
- `customer-balanced` runs `macos`, `iphone-15-pro`, `galaxy-s25-ultra`, and
  `pixel-9-pro-xl` in series.
- BrowserStack account concurrency is normally one; bots should create one
  worker at a time unless account status says it is safe to fan out.

## Reporting

Always report `proveTotalMs = chonk_setup + chonk_prove` as the headline
metric. `proveMs` alone excludes the load/accumulate setup that is real Chonk
prover cost, while total wall time includes harness fetch, CRS transfer, SRS
load, and BrowserStack noise.

Keep raw result JSONL, screenshots, the generated link JSON, and the HTML
preview gist with the PR or Slack report when sharing results.
