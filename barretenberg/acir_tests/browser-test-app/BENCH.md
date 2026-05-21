# Paired A/B browser benchmarking

`window.runChonkAb` runs a Chonk prove repeatedly, interleaving two `bb.wasm` variants on the
**same device in one session**, and reports the paired median delta with a bootstrap 95% CI. This is
the BrowserStack flow for "is this PR faster than its base on real hardware?".

Why paired + CI: between-session variance on real devices (different physical unit, thermal state,
co-tenant) dwarfs single-digit prover deltas. Comparing both variants back-to-back on one device,
many times, and reporting a confidence interval is what makes a 3–6% delta distinguishable from
noise — or honestly reports that it is not.

## How variant selection works

Both binaries are hosted side by side and chosen at runtime via bb.js's `wasmPath` option (no
rebuild, no second bundle):

```
bench-wasm/
  base/barretenberg.wasm.gz   base/barretenberg-threads.wasm.gz
  pr/barretenberg.wasm.gz     pr/barretenberg-threads.wasm.gz
```

`runChonkAb` calls `proveChonk(buf, threads, { wasmPath: "/wasm/<variant>/barretenberg.wasm.gz" })`;
bb.js appends the `-threads` suffix and ungzips. The base/pr `.wasm.gz` come from building bb.wasm
on the PR head and on the PR's real merge-base with identical flags.

## Bench params

The page auto-runs when given a base64url-encoded `bench` query param decoding to:

```json
{ "flow": "ecdsar1+transfer_1_recursions+sponsored_fpc",
  "threads": 8, "pairs": 11, "warmupRuns": 1,
  "variants": ["pr", "base"], "memMaxPages": 16384 }
```

`memMaxPages` (e.g. 16384 = 1 GiB) maps to `Barretenberg.new({ memory: { maximum } })`; set it on
iOS Safari, which rejects the default 4 GiB SharedArrayBuffer. `pairs` ≥ 11 with `warmupRuns: 1`
gives 10 paired data points (drop pair 1 for cold compile / cold worker pool).

## Running locally / on BrowserStack

```bash
yarn build                       # webpack the app into dest/
# stage the two variants under bench-wasm/{base,pr}/
yarn serve-bench --port 8090 --wasm-dir bench-wasm \
  --inputs-dir ../../../yarn-project/end-to-end/example-app-ivc-inputs-out
# tunnel + point a BrowserStack worker at <tunnel>/index.html?bench=<base64url>
```

The server posts each run to `/progress` and the final `{mode:"ab", byVariant, paired}` record to
`/result` (JSONL). `window.__benchResult` holds the same payload for a WebDriver/MCP poller.

## Reporting rule

Report `paired.deltaPct.median` with `paired.deltaPctCI95`. **If the CI crosses zero, the result is
not distinguishable from zero at this N — say so, do not report a signed delta.** Increase `pairs`
to tighten the CI (roughly, doubling N halves its width).

### iOS note

iOS Safari will not allocate a second SAB-backed `WebAssembly.Memory` in one tab even after the
worker is torn down, so in-page A/B OOMs after the first variant. On iOS, run two separate sessions
(one variant each, `pairs` runs of a single variant) and pair by run index; both sessions share the
same thermal ramp so position-pairing cancels it.
