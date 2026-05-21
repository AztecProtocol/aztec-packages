---
name: browserstack-local-dev
description: Set up and run the local BrowserStack development loop for barretenberg wasm-bench. Use when asked for browserstack-local-dev, BrowserStack local dev, local BrowserStack Chonk profiling, repeated browser proves after WASM changes, smoke-testing BrowserStack wiring, or producing baseline-vs-head timing diffs from wasm-bench results.
---

# BrowserStack Local Dev

Use the repo-owned wasm-bench runner to control BrowserStack. Do not drive the BrowserStack dashboard manually. Keep the loop narrow: one target, one flow, traces off unless the user asks for Perfetto.

Default target: `windows-chrome`. Use `macos` for Apple desktop behavior and `iphone-15-pro` for Safari/iOS-specific behavior; iOS uses Automate + `acceptSsl` and is slower to arm.

The `ci-wasm-bench` label runs the full eight-target catalogue and keeps going after individual target failures so the dashboard can show the whole report. Package-local `bench_cmds` defaults to the fast core, `windows-chrome` and `iphone-15-pro`; set `WASM_BENCH_PLATFORMS=all` for local parity with labeled CI.

Default benchmark: `chonk-ivc`. Override with `WASM_BENCH_BENCHMARK=<key>` when `wasm-bench.config.json` contains another benchmark.

Default flow:

```bash
FLOW="ecdsar1+transfer_1_recursions+sponsored_fpc"
```

## Preflight

From the repo root:

```bash
if [ -f "$HOME/.env" ]; then
  set -a
  . "$HOME/.env"
  set +a
fi
test -n "$BROWSERSTACK_USERNAME" || { echo "missing BROWSERSTACK_USERNAME"; exit 2; }
test -n "$BROWSERSTACK_ACCESS_KEY" || { echo "missing BROWSERSTACK_ACCESS_KEY"; exit 2; }

barretenberg/crs/bootstrap.sh
barretenberg/cpp/scripts/chonk_inputs.sh download
```

If the user is iterating on barretenberg WASM, build the WASM binary and wasm-bench bundle:

```bash
(cd barretenberg/cpp && AVM=0 AVM_TRANSPILER=0 cmake --preset wasm-threads -DAVM=OFF -DAVM_TRANSPILER_LIB= -B build-wasm-threads)
(cd barretenberg/cpp && AVM=0 AVM_TRANSPILER=0 cmake --build --preset wasm-threads --target barretenberg.wasm.gz)
(cd barretenberg/wasm-bench && ./bootstrap.sh)
```

## Fastest Plumbing Check

Smoke mode proves BrowserStack Local, COOP/COEP, `crossOriginIsolated`, `SharedArrayBuffer`, worker startup, browser-native wasm gzip fetch/compile, and input fetch. It does not run `chonk_setup` or `chonk_prove`.

```bash
cd barretenberg/wasm-bench
WASM_BENCH_SMOKE=1 WASM_BENCH_TRACE=0 ./scripts/run-ci-bench.sh windows-chrome "$FLOW" 1
```

Use this after changing tunnel/session/page code. Do not use it as a proving performance signal.

## Minimum Repeated-Prove Loop

Start from the baseline, stream the changed run against it, then print the final metric diff. This is the default protocol for proving a WASM change. Use files for state so a bot can resume after interruption.

```bash
cd barretenberg/wasm-bench
TARGET="${TARGET:-windows-chrome}"
FLOW="${FLOW:-ecdsar1+transfer_1_recursions+sponsored_fpc}"
BENCHMARK="${WASM_BENCH_BENCHMARK:-chonk-ivc}"
SAFE_BENCHMARK="${BENCHMARK//[^A-Za-z0-9_-]/-}"
ARTIFACT_KEY="$TARGET"
if [ "$BENCHMARK" != "chonk-ivc" ]; then
  ARTIFACT_KEY="$TARGET-$SAFE_BENCHMARK"
fi
DEV_DIR="bench-out/local-dev/$ARTIFACT_KEY"
mkdir -p "$DEV_DIR"
printf 'target=%s\nbenchmark=%s\nflow=%s\ndev_dir=%s\nartifact_key=%s\n' "$TARGET" "$BENCHMARK" "$FLOW" "$DEV_DIR" "$ARTIFACT_KEY" > "$DEV_DIR/state.env"

WASM_BENCH_TRACE=0 ./scripts/run-ci-bench.sh "$TARGET" "$FLOW" 1
cp "bench-out/$ARTIFACT_KEY/results.jsonl" "$DEV_DIR/base.jsonl"
cp "bench-out/$ARTIFACT_KEY/progress.jsonl" "$DEV_DIR/base-progress.jsonl"
```

After editing C++/WASM code:

```bash
(cd ../cpp && AVM=0 AVM_TRANSPILER=0 cmake --build --preset wasm-threads --target barretenberg.wasm.gz)
yarn build

rm -f "$DEV_DIR/head-progress.jsonl" "$DEV_DIR/head.jsonl" "bench-out/$ARTIFACT_KEY/progress.jsonl" "bench-out/$ARTIFACT_KEY/results.jsonl"
WASM_BENCH_TRACE=0 ./scripts/run-ci-bench.sh "$TARGET" "$FLOW" 1 2>&1 | tee "$DEV_DIR/head.log" &
echo $! > "$DEV_DIR/runner.pid"
while [ ! -f "bench-out/$ARTIFACT_KEY/progress.jsonl" ] && kill -0 "$(cat "$DEV_DIR/runner.pid")" 2>/dev/null; do sleep 1; done
node scripts/progress-diff.mjs --base "$DEV_DIR/base-progress.jsonl" --head "bench-out/$ARTIFACT_KEY/progress.jsonl" --watch | tee "$DEV_DIR/progress-diff.log" || true
wait "$(cat "$DEV_DIR/runner.pid")" || runner_exit=$?
echo "${runner_exit:-0}" > "$DEV_DIR/runner.exit"
if [ -f "bench-out/$ARTIFACT_KEY/results.jsonl" ]; then
  cp "bench-out/$ARTIFACT_KEY/results.jsonl" "$DEV_DIR/head.jsonl"
  node scripts/jsonl-diff.mjs --base "$DEV_DIR/base.jsonl" --head "$DEV_DIR/head.jsonl"
fi
```

The runner streams high-level progress to stdout. Always preserve and report the progress lines around slow phases:

- BrowserStack Local ready
- BrowserStack launch ready
- page JS start / worker start
- wasm gzip fetch/browser decode/compile
- input fetch
- CRS fetch/init
- `chonk_setup_start`, `chonk_setup`
- `chonk_prove_start`, `chonk_prove`
- result posted / headline

Report the diff table plus the headline values: `proveTotalMs` (`setupMs + proveMs`), `setupMs` (`chonk_setup` only), `proveMs` (`chonk_prove` only), `wallMs`, thread count, and the rkapp dashboard URL when artifacts were uploaded. Break inefficiency into cold-start buckets (`main.js`, worker boot, wasm headers, wasm stream/compile, input fetch/decode) and worker-run buckets (bb init, CRS fetch, SRS init, trace/report, cleanup, other run time).

## Mix-And-Match Pieces

Use these pieces independently when the user needs a narrower loop:

| Piece | Command / file | Purpose |
|---|---|---|
| Target + benchmark catalog | `wasm-bench.config.json` | AI-friendly source of target names, benchmark keys, default flows, chips, BrowserStack caps, local URL scheme, iOS memory cap, and timeouts. |
| Matrix profiles | `WASM_BENCH_PLATFORMS=default`, `customer-balanced`, `all`, or explicit comma-separated targets | Select coverage by intent: fast local core, broader Automate-only review, full catalogue, or a single target. |
| Latest mobile OS resolution | `scripts/run-browserstack.mjs` + BrowserStack `/automate/browsers.json` | If a real-mobile target says `os_version: latest`, resolve it to the latest OS currently available for that device/browser pair before session creation. |
| Build C++ WASM | `(cd barretenberg/cpp && cmake --build --preset wasm-threads --target barretenberg.wasm.gz)` | Rebuild only the wasm binary after C++ changes. |
| Build page bundle | `(cd barretenberg/wasm-bench && yarn build)` | Copy the latest `barretenberg.wasm.gz` and rebuild the browser harness. |
| Chonk browser entry | `bbapi` commands: `ChonkStart`, `ChonkLoad`, `ChonkAccumulate`, `ChonkProve` | The browser decodes `ivc-inputs.msgpack`, inflates bytecode/witness bytes, then uses the standard bbapi command path. |
| Serve harness | `node scripts/serve-bench.mjs --port "$PORT" --inputs-dir "$INPUTS" --crs-dir "$CRS" --results-file "$RESULTS" --progress-file "$PROGRESS" --trace-dir "$TRACES"` | Keep the local site alive across repeated BrowserStack sessions. |
| BrowserStack Local | `/tmp/bin/BrowserStackLocal --key "$BROWSERSTACK_ACCESS_KEY" --local-identifier "$LOCAL_ID" ...` | Keep the tunnel alive across repeated sessions. Use `--only-automate` only for Automate targets, and use iOS `--https-ports 8443` when target config says HTTPS. |
| One BrowserStack run | `node scripts/run-browserstack.mjs --target "$TARGET" --url "$URL" --local-identifier "$LOCAL_ID" ...` | Control one BrowserStack session against an already-running local site. |
| CI-compatible wrapper | `WASM_BENCH_BENCHMARK=chonk-ivc WASM_BENCH_TRACE=0 ./scripts/run-ci-bench.sh "$TARGET" "$FLOW" 1` | Known-good all-in-one path. Prefer this unless tunnel startup is the bottleneck. |
| Smoke run | `WASM_BENCH_SMOKE=1 WASM_BENCH_TRACE=0 ./scripts/run-ci-bench.sh "$TARGET" "$FLOW" 1` | Validate BrowserStack/page/worker/wasm cold-start without proving. |
| Perfetto trace URL | Serve `bench-out/<target>/traces/*.perfetto.json` with CORS, tunnel it, verify the public URL returns `200`, then return `https://ui.perfetto.dev/#!/?url=<encoded public trace URL>` | When tracing is requested, always give the user a clickable Perfetto UI URL, not only the local trace path. |
| Stream phase deltas | `node scripts/progress-diff.mjs --base base-progress.jsonl --head head-progress.jsonl --watch` | Compare changed run progress to baseline while the run is still in flight. |
| Final metric diff | `node scripts/jsonl-diff.mjs --base base.jsonl --head head.jsonl` | Compare `proveTotalMs`, setup, prove, wall, cold-start, and phase metrics after completion. |
| rkapp dashboard index | `node scripts/write-trace-manifest.mjs ...` then `scripts/upload-rkapp-artifacts.sh bench-out <run-id>` | Produce the hosted BrowserStack bench page at `http://ci.aztec-labs.com/wasm-bench?run=<run-id>`. |
| Benchmark-page rows | `node scripts/jsonl-to-bench.mjs --in results.jsonl --out out.bench.json --label ...` | Produce legacy `github-action-benchmark` rows for ad hoc comparison only. Do not use as the primary report. |

When composing manually, keep the artifacts explicit: `base.jsonl`, `base-progress.jsonl`, `head.jsonl`, `head-progress.jsonl`, `runner.log`, and `serve.log`.

Bot contract:

- If BrowserStack env vars are missing, source `$HOME/.env` with `set -a`; require `BROWSERSTACK_USERNAME` and `BROWSERSTACK_ACCESS_KEY`, and never print secret values.
- Write `state.env` with `target`, `benchmark`, `flow`, `dev_dir`, `artifact_key`, and, for manual sessions, `port`, `local_id`, `serve_pid`, `browserstack_local_pid`.
- Write PID files before waiting: `serve.pid`, `browserstack-local.pid`, `runner.pid`.
- Use absolute or repo-root-relative paths in commands and final reports.
- Never rely on interactive BrowserStack dashboard state.
- If interrupted, read `state.env` and PID files, check whether each process is alive, then either resume streaming logs or cleanly stop them.
- Report exact commands used and exact artifact paths.
- If `WASM_BENCH_TRACE=1` or the user asks for Perfetto, prefer the rkapp trace link after CI upload. For local-only traces, report both the `.perfetto.json` artifact path and a `ui.perfetto.dev` URL. The trace file must be reachable by the user's browser, so keep a small local static server running with `Access-Control-Allow-Origin: *`, expose it through a tunnel such as `ngrok http <port>`, verify the public trace URL returns `200`, and point Perfetto at that public HTTPS trace URL. Never give a `ui.perfetto.dev` URL that encodes `127.0.0.1`, `localhost`, or another private address unless the user explicitly says their browser is on the same machine.
- If Perfetto shows `Could not load local trace TypeError: Failed to fetch`, the trace URL is not reachable from the user's browser. Keep the trace server running, tunnel the server, verify the public trace URL returns `200`, and send a new `ui.perfetto.dev` URL using that public trace URL.
- Prefer `run-ci-bench.sh` when unsure; split pieces only after one wrapper run has passed.

## Lower-Overhead Local Session

For several iterations, avoid repeatedly setting up credentials and fixtures by keeping one shell open in `barretenberg/wasm-bench` and rerunning only the final runner command after each rebuild.

Use `run-ci-bench.sh` for the first successful run so the server, BrowserStack Local flags, target config, and cert behavior are known-good. If repeated tunnel startup is the bottleneck, split the wrapper manually:

1. Start `scripts/serve-bench.mjs` once with explicit `--results-file`, `--progress-file`, `--trace-dir`, `--inputs-dir`, and `--crs-dir`.
2. Start `/tmp/bin/BrowserStackLocal` once with the same `--local-identifier` passed to `run-browserstack.mjs`.
3. Rebuild `barretenberg.wasm.gz`, run `yarn build`, then rerun:

```bash
node scripts/run-browserstack.mjs \
  --target "$TARGET" \
  --flow "$FLOW" \
  --runs 1 \
  --url "http://localhost:$PORT" \
  --local-identifier "$LOCAL_ID" \
  --results-file "$DEV_DIR/head.jsonl" \
  --progress-file "$DEV_DIR/head-progress.jsonl" \
  --artifacts "$DEV_DIR" \
  --deadline-ms 1500000 \
  --stall-ms 240000
```

While that command is running, stream the change against the saved baseline:

```bash
node scripts/progress-diff.mjs --base "$DEV_DIR/base-progress.jsonl" --head "$DEV_DIR/head-progress.jsonl" --watch
```

Prefer the wrapper unless you need this extra speed. If you split it manually, write down the `PORT`, `LOCAL_ID`, server PID, BrowserStack Local PID, and artifact directory in the chat so the user can stop or reuse them.

Manual split state template:

```bash
cat > "$DEV_DIR/state.env" <<EOF
target=$TARGET
flow=$FLOW
dev_dir=$DEV_DIR
port=$PORT
local_id=$LOCAL_ID
serve_pid=$SERVE_PID
browserstack_local_pid=$BS_LOCAL_PID
url=$URL
EOF
```

## Reading Results

Use `scripts/jsonl-diff.mjs` for baseline-vs-head comparisons. Positive deltas are slower.

```bash
node scripts/jsonl-diff.mjs --base "$DEV_DIR/base.jsonl" --head "$DEV_DIR/head.jsonl"
```

Use `scripts/progress-diff.mjs` for in-flight phase deltas. Positive deltas are slower at that phase boundary.

```bash
node scripts/progress-diff.mjs --base "$DEV_DIR/base-progress.jsonl" --head "$DEV_DIR/head-progress.jsonl" --watch
```

When a trace exists, serve it locally, tunnel it, verify the public trace URL, and return only the public Perfetto URL:

```bash
TRACE_DIR="bench-out/$ARTIFACT_KEY/traces"
TRACE_FILE="$(find "$TRACE_DIR" -maxdepth 1 -name '*.perfetto.json' -type f | sort | tail -1)"
TRACE_PORT="${TRACE_PORT:-18089}"
node - "$TRACE_FILE" "$TRACE_PORT" <<'NODE'
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const file = resolve(process.argv[2]);
const port = Number(process.argv[3]);
const name = basename(file);
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (new URL(req.url ?? '/', 'http://localhost').pathname !== `/${name}`) return res.writeHead(404).end('not found');
  const st = statSync(file);
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': st.size, 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving ${name} on 127.0.0.1:${port}`));
NODE
```

Then start a tunnel in another shell. Use the public HTTPS URL from ngrok, verify it, and only then build the Perfetto link:

```bash
ngrok http "$TRACE_PORT"
PUBLIC_TRACE_URL="https://<ngrok-host>/<trace-file-name>"
curl -fsSI "$PUBLIC_TRACE_URL" | sed -n '1,20p'
python3 - <<'PY'
from urllib.parse import quote
import os
print("https://ui.perfetto.dev/#!/?url=" + quote(os.environ["PUBLIC_TRACE_URL"], safe=""))
PY
```

## Rules

- Default local development to one target. The labeled CI path runs the full matrix.
- Use `customer-balanced` for a human review pass that needs more representative coverage without the full mobile catalogue. Run `WASM_BENCH_PLATFORMS=all` for local parity with labeled CI, and smoke-test Android targets first if BrowserStack has recently shown no-page-progress failures.
- Default to `WASM_BENCH_TRACE=0`; turn traces on only when the user asks for Perfetto.
- Do not run single-thread baselines unless explicitly requested.
- Treat missing `crossOriginIsolated` or `SharedArrayBuffer` as a hard failure.
- Treat stale pinned inputs as a hard failure; re-download pinned inputs before blaming the runner.
- Never check in `bench-out` artifacts.
