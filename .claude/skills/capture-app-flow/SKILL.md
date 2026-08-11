---
name: capture-app-flow
description: Capture ivc-inputs.msgpack from an external/third-party Aztec app's transaction flow so it can be proven and benchmarked like a pinned Chonk flow. Use when investigating a client-side proving perf regression in an app that consumes published @aztec/* packages (e.g. across a major version bump), or when adding a new app flow to the Chonk benchmark set.
argument-hint: <app-repo> <flow> e.g. "myapp checkout-lifecycle"
---

# Capture an external app's flow as Chonk IVC inputs

An external app (consuming published `@aztec/*` npm packages) proves its private txs client-side via Chonk IVC. To benchmark or debug that proving — or to find why it got slower after an Aztec version bump — capture the app's flow into `ivc-inputs.msgpack` files, then prove them with `bb` exactly like the pinned flows in `labs-aztec-toolchain/chonk-pinned-flows/` (populated by `labs-aztec-toolchain/download_chonk_inputs.sh`).

This skill covers the **capture** (the novel part). For the downstream proving/benchmarking, prove the resulting msgpack files with the toolchain `bb` (`bb prove --scheme chonk --ivc_inputs_path <file>`).

**Two modes.** Capturing a flow (Steps 1–4) is **single-version**: point the toolchain at the app's pinned `@aztec/*` version, capture, and you have the msgpacks. Chasing a **regression** (Step 5) is an optional overlay — capture the *same* flow from two versions and compare. If you only need the msgpacks (e.g. adding a flow to the benchmark set), stop after Step 4.

Measure cheapest-first: native `bb` for the trend, gate counts to explain it, and WASM only when the change is prover-side — **Step 5** has the decision logic.

## Mental model

Capture goes through the **public aztec.js API only**: `profile()` (on `ContractFunctionInteraction`/`DeployMethod`) returns `executionSteps`, which `serializePrivateExecutionSteps` (from `@aztec/stdlib/kernel`) writes to `ivc-inputs.msgpack`. The one catch: **`profile()` simulates and proves but does not send**, so in a stateful flow you **capture, then send** each step on its correct pre-state:

```ts
import { serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';

const i = contract.methods.step(...args);
const r = await i.profile({ profileMode: 'full', skipProofGeneration: false, from });
await writeFile(`${OUT}/<flow>_<step>/ivc-inputs.msgpack`, serializePrivateExecutionSteps(r.executionSteps));
await i.send({ from });   // land it so the next step sees the right pre-state
```

The in-repo bench harness works exactly this way — `captureProfile` in `client_flows/benchmark.ts` (called by the `client_flows/*.test.ts` flows) is a concrete reference — writing one file per labelled step under `$CAPTURE_IVC_FOLDER/<label>/`.

## Step 1 — Identify the flow and the versions

In the app repo:

1. **Find the end-to-end flow** that already drives the private txs against a local network. It's usually a single test *file* — one `describe` with per-step `test()` blocks and shared `beforeAll` setup — that calls `.send({ from })` on each interaction in order, with all wallet/authwit/setup plumbing done. Instrument it rather than rebuild the flow.
2. **Pin the app's Aztec version** from the relevant `package.json` (`@aztec/aztec.js` etc.). Record it exactly — it is not interchangeable with aztec-packages repo HEAD. *(Regression overlay: pin **two** versions, the "before" and "after", often on separate branches — e.g. a stable branch vs a version-bump branch.)*

> **Typical shape.** A multi-step app lifecycle (`step_1 → step_2 → … → step_n`, each a private tx) driven by one `*.e2e.test.ts` (under whatever runner the app uses — `bun:test`, `vitest`, `jest`, …) against `aztec start --local-network`. (For a regression, the same flow is captured once per pinned version.)

### If the flow is only reachable in the browser

**Prefer a local node environment whenever one is usable** — a node-runnable test/script driven against `aztec start --local-network` (Steps 2–3) is by far the cheapest and most reliable path, and is what the rest of this skill assumes. Many apps that *ship* as a web app still have a node-side test, CLI, or script that exercises the same contract interactions; use that. Only fall back to the browser when the private txs are genuinely reachable *only* through the web UI.

In the browser case, capture still goes through the same aztec.js API — the only new problem is getting the bytes out of the page:

1. **Find where the app builds and proves the interaction** (the wallet/PXE call that turns `contract.methods.foo(...)` into a proof). The same `interaction.profile({ profileMode: 'full', skipProofGeneration: true })` runs client-side and returns `executionSteps`; serialize them with `serializePrivateExecutionSteps` exactly as in Step 2. The browser WASM proving path is also the **fidelity ground-truth** — it captures precisely what the app proves in production.
2. **Exfiltrate each step's msgpack from the page**, gated behind a flag (a `?capture=1` query param or a build-time env). Pick whichever the app makes easiest: trigger a `Blob` + anchor **download** per step, `fetch('http://localhost:9000/<label>', { method: 'POST', body })` to a tiny local sink server, or stash into IndexedDB and read it out afterwards. Keep the same one-folder-per-step layout (`<flow>_<step>/ivc-inputs.msgpack`) once the files land on disk.

From there, proving and benchmarking (Steps 4–5) are identical — the msgpack is the same artifact regardless of where it was captured.

## Step 2 — Instrument the flow test to capture

On a throwaway branch in the app repo, gate capture behind an env var so the test is unchanged when not capturing:

```ts
import { serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = process.env.CAPTURE_IVC_FOLDER;

// Pass the SAME opts object to profile() and send(). `opts` is whatever that step's
// send() already takes — `from`, plus any per-step extras (`authWitnesses`, fee
// options, …). Profiling with different opts would capture a different tx than the
// one that lands.
async function captureThenSend(label: string, interaction, opts) {
  if (OUT) {
    const dir = join(OUT, label);
    await mkdir(dir, { recursive: true });
    const r = await interaction.profile({ ...opts, profileMode: 'full', skipProofGeneration: false });
    await writeFile(join(dir, 'ivc-inputs.msgpack'), serializePrivateExecutionSteps(r.executionSteps));
  }
  return interaction.send(opts); // always send so the flow advances
}
```

Replace each lifecycle `await someInteraction.send(opts)` with `await captureThenSend('<flow>_<step>', someInteraction, opts)`. The interaction must be a variable (assign `const i = contract.methods.foo(...)` first) so the same object is profiled and sent.

`skipProofGeneration: false` is what the AMM harness uses, but the msgpack only needs the witnesses/bytecode/VK, which come from simulation — `true` is faster and yields the same file. Keep `false` only if you also want the in-process proving stats.

Result: a directory tree matching the pinned-flow layout — `<flow>_<step>/ivc-inputs.msgpack` per step. (A 4-step lifecycle captured in ~80s with proofs on, and the instrumented test still passed.)

**Checkpoints (verify, don't assume — these differ across versions):**
- Confirm `serializePrivateExecutionSteps` is exported from `@aztec/stdlib/kernel` in the app's installed version. If it isn't, inline the encoding with `msgpackr` — it's just `new Encoder({ useRecords: false }).pack(steps.map(s => ({ bytecode: s.bytecode, witness: serializeWitness(s.witness), vk: s.vk, functionName: s.functionName, kind: s.kind })))`. The decoding side is `private_execution_steps.hpp` in the barretenberg (foundation) repo.
- Confirm the `profile()` signature: `profileMode` accepts `'gates' | 'execution-steps' | 'full'`; `'full'` is required to get `executionSteps`. The `from` field is required.

## Step 3 — Run the capture against a version-matched node (no docker needed)

The current `aztec` toolchain installs **natively** — `aztec start --local-network` runs a full node + L1 + funded test accounts in one process, no docker. Pin the toolchain to the app's exact version, then run the instrumented test against it:

```bash
# 1. runtime + toolchain pinned to the app's version (<version> = the app's @aztec/* pin)
curl -fsSL https://bun.sh/install | bash
bash <(curl -fsSL https://install.aztec.network)   # bootstraps `aztec-up` into ~/.aztec/bin (once)
aztec-up install <version>                          # installs ~/.aztec/versions/<version> AND activates it (symlinks ~/.aztec/current)
export PATH="$HOME/.aztec/current/bin:$HOME/.bun/bin:$PATH"

# 2. start the node (defaults to :8080), wait until node_getNodeInfo returns a result
aztec start --local-network --port 8080 &

# 3. install app deps and run the instrumented flow (use the app's OWN package manager + runner)
cd <app>/<flow-test-package> && bun install
CAPTURE_IVC_FOLDER=/abs/captures/<version> AZTEC_NODE_URL=http://localhost:8080 \
  bun test --timeout 1800000 --preload ./test/preload.ts test/<flow>.e2e.test.ts
```

The package, package manager, runner, and `--preload` are all app-specific — match whatever the app's flow test already uses (`bun test`, `vitest`, `jest`, or a plain script). The `--preload` shown is one app's shim for importing aztec.js under bun, not a general requirement.

The version manager is `aztec-up`, and its interface is a subcommand, **not** a `VERSION=` env var (the env-var form just prints help): `aztec-up install <v>` adds and activates a version, `aztec-up use <v>` switches between already-installed ones, `aztec-up list` shows them. For the baseline, `aztec-up install <other-version>` (or `aztec-up use <other-version>` if already installed) repoints `current`; each installed version stays under `~/.aztec/versions/<version>/`. If the app commits its compiled contract artifacts (e.g. `src/artifacts/*`), no `nargo` compile is needed; if it doesn't, build them first — that pulls in the app's own noir toolchain and contract dependencies.

### Registry version pins — if a recent version won't install

A freshly published version (e.g. an `-rc.N`) can be **blocked by a release-age pin** even though it exists on the registry, because the install resolves it through a date cutoff. Two independent mechanisms show up, and a capture hits *both* (the toolchain install goes through npm; the app deps go through bun):

- **npm** (`aztec-up`'s installs): `~/.npmrc` `min-release-age=<days>`. Symptom: `npm error code ETARGET … No matching version found for @aztec/aztec@<version> with a date before <date>`.
- **bun** (`bun install`): `bunfig.toml` `[install] minimumReleaseAge = <seconds>`. Symptom: `error: @aztec/aztec.js@<version> failed to resolve`.

Ask the user if they are willing to override the **age**, not the date — passing `--before`/`npm_config_before` while an age pin is set errors with `--min-release-age cannot be provided when using --before` - with the smallest value that still admits the target, i.e. `≤ (now − publish_time)`; check the publish time with `npm view @aztec/aztec.js@<version> time` or the registry JSON:

```bash
# toolchain install (npm under the hood): age in DAYS
npm_config_min_release_age=<days> aztec-up install <version>
# app deps (bun): age in SECONDS, as a flag
bun install --minimum-release-age=<seconds>
```

## Step 4 — Prove & benchmark with a version-matched `bb`

**Using the wrong `bb` is the most common way to get a wrong answer.** Each version's msgpack must be proven with the `bb` that shipped in that same version — not with the current `aztec-packages` HEAD (a later version, e.g. `next`), which would skew the comparison. The msgpack carries bytecode + VKs tied to its package version.

You don't need to build `bb` from a release tag — the pinned toolchain already ships the matching one at `~/.aztec/versions/<version>/node_modules/.bin/bb` (exposed as `aztec-bb` when `<version>` is `current`); it reports `bb --version == <version>`. Reference it by absolute path:

```bash
BB=~/.aztec/versions/<version>/node_modules/.bin/bb   # the bb that shipped with the captured version

# fast validity check (no full proving)
HARDWARE_CONCURRENCY=8 $BB check --scheme chonk --ivc_inputs_path /abs/captures/<version>/<flow>/ivc-inputs.msgpack

# timed prove + hierarchical breakdown
HARDWARE_CONCURRENCY=8 $BB prove --scheme chonk \
  --ivc_inputs_path /abs/captures/<version>/<flow>/ivc-inputs.msgpack \
  -o /tmp/out -v --print_bench --bench_out_hierarchical /tmp/out/breakdown.json
```

For a regression, keep each version's own `bb` by absolute path (`BB_A=~/.aztec/versions/<version-a>/…`, `BB_B=~/.aztec/versions/<version-b>/…`) and run the matching `bb` against that version's captures.

For the breakdown machinery (per-circuit timing, dashboards) see the **`benchmark-chonk`** skill. Sweep `HARDWARE_CONCURRENCY` `1/4/8` if thread-scaling matters to the client.

The toolchain `bb` is a **native compiled binary** (full native speed), version-matched and needs no build — the right tool for the trend (Step 5). It is *not* the browser's WASM build, so absolute times differ from in-browser, but the relative cross-version comparison holds. Local runs are noisy — average ≥2 runs, or use `/remote-bench` for single-run numbers.

## Step 5 — Isolate a regression (optional — two-version overlay)

This step applies only when you're comparing two versions; skip it for a one-off capture. Capture the **same flow** from both versions, then measure cheapest-first — each step is more work than the last:

1. **Native `bb` for the trend.** The version-matched native binary (Step 4) is fast and low-noise — proving both versions confirms or disproves a glaring regression in minutes and gives the per-flow direction and rough magnitude. Start here.

2. **Gate counts — measure the circuit side.** Compare the captures: number of execution steps (`result.executionSteps.length`), per-step `functionName`/`kind`, and gate counts per circuit. Gate counts aren't in the msgpack (it holds bytecode) and the verbose prove doesn't print them, so extract each step's `bytecode` (gzipped bincode ACIR) and run `bb gates --scheme chonk -b <bytecode>` — the default `ultra_honk` builder rejects Mega app circuits, so `--scheme chonk` is required. Sum `circuit_size` per flow. This is the circuit-side magnitude that should account for the timing change.

3. **Attribute — circuit-side or prover-side.** Compare the gate delta (step 2) to the time delta (step 1): if proving time moved in step with gate counts, the change is circuit-side (noir/protocol); if time moved *more* than the gate change explains, the prover itself regressed. The rigorous version — hold inputs fixed and vary only `bb` by proving one version's msgpack on both builds — is usually unavailable across a major bump because the newer `bb` rejects the older msgpack (VK/format changes). That cross-prove is reliable only when the formats are compatible, i.e. prover-optimization work where the circuits are fixed (step 4), not the version-regression case.

4. **WASM — only when it can differ.** For a version/circuit comparison the circuits differ but proving cost is driven by circuit size on both backends, so the native direction usually carries over (a heuristic, not a guarantee — backends weight circuit types differently); WASM then only adds absolute in-browser numbers. For a **prover-side backend optimization** (Pippenger/MSM, SIMD, threading, WebGPU) the circuits are fixed and the gains are backend/runtime-specific — a native speedup can shrink, vanish, or invert under WASM, so measure the target runtime directly; native is not a proxy. The toolchain `bb` **CLI is native-only**; the WASM path is reachable only through the bb.js *library* API (`AztecClientBackend` with `BackendType.Wasm`, fed decoded execution steps) — a version-specific lift, so this skill points at the path rather than shipping a turnkey recipe. (To capture *fidelity-exact* in-browser inputs, see the browser case in Step 1.)

Report which axis dominates — that decides whether the fix is in circuits or in barretenberg. The full loop per version is: capture → gate counts → timed A/B, sweeping `HARDWARE_CONCURRENCY` `1/4/8` so a thread-scaling difference between the versions doesn't hide in a single-thread-count number.

## Gotchas

- **Capture before send**, never after — `profile()` builds the witness from current chain state, so it must run while the chain is in that step's pre-state.
- **One folder per step.** The prover consumes a single flow per `--ivc_inputs_path`; don't concatenate steps.
- **Don't commit captured msgpack to git** (app repo or aztec-packages) — they're large binaries; keep them in a scratch dir.
- **Match `HARDWARE_CONCURRENCY`** across the versions you compare (8 local, 16 remote) — thread count changes the numbers.
