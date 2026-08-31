---
name: benchmark-avm
description: Run the AVM full-proving benchmark (avm_bulk.test.ts) locally and get per-stage proving timings, including legacy-vs-new Pippenger MSM A/B via the BB_MSM_LEGACY env toggle. Use when measuring or comparing AVM proving performance, or attributing time to commitment/MSM stages.
argument-hint: <action> e.g. "run", "legacy", "ab", "build", "setup"
---

# Benchmark AVM (local full proving)

Run the **AVM full-proving** benchmark — the same one CI tracks on the benchmark dashboard — locally, and read its per-stage proving breakdown. This is the AVM analogue of `/benchmark-chonk`.

The benchmark is a jest test, `yarn-project/bb-prover/src/avm_proving_tests/avm_bulk.test.ts`. It does **full AVM proving** (not check-circuit — see the comment at the top of the test): it runs `bulkTest()` against the `AvmTest` contract through the real prover and records per-stage timings into a `TestExecutorMetrics`.

## Setup — do this once per merge-train sync (minutes, not hours)

The bulk test drives a real public-tx flow: it **simulates** the `AvmTest` contract against a live **world-state DB**, then **proves** with `bb-avm`. Since the world-state runs as a separate **IPC process** (`aztec-wsdb`) reached through two top-level components, `wsdb/` and `ipc-runtime/`, that are `portal:`-linked into yarn-project. A plain `./bootstrap.sh build yarn-project` does **not** wire these up (it serves cached artifacts), and the pinned `AvmTest` artifact and several `dest/` trees might go stale. The archaeology to discover all this is what turns a "quick bench" into hours; the recipe below is the distilled fast path. Run it from the repo root:

```bash
# 1. C++ binaries: AVM prover + native addon (@aztec/native) + IPC world-state DB
(cd barretenberg/cpp && cmake --preset default -DAVM=ON \
  && cmake --build build --target bb-avm aztec-wsdb nodejs_module)
(cd barretenberg/ts && BUILD_CPP=0 ./scripts/copy_native.sh)   # place nodejs_module.node where findNapiBinary() looks

# 2. IPC world-state stack (portal deps; NOT set up by a yarn-project build).
#    wsdb/bootstrap.sh copies the aztec-wsdb binary built in step 1 into wsdb/ts/build/<arch>/.
(cd ipc-runtime && ./bootstrap.sh)
(cd wsdb && ./bootstrap.sh)

# 3. Refresh the AVM test contract artifact. Merge-train changes to constants.nr / AVM opcodes make the
#    pinned AvmTest bytecode revert immediately (see "reverts with 0 instructions" below). nargo + the
#    avm-transpiler must already be built (they are after any recent noir/noir-projects build).
(cd labs/noir-projects/noir-contracts && ./bootstrap.sh build avm_test_contract)

# 4. Link portals, regenerate the AvmTest TS wrapper from the fresh artifact, compile TS.
(cd yarn-project && yarn install \
  && yarn workspace @aztec/noir-test-contracts.js generate \
  && yarn build)
```

On an already-provisioned machine this is ~5–8 min (the C++ relink and `yarn build` are the long poles); on a cold machine the C++ build dominates. Steps you can skip once done: **1** only needs re-running when C++ changes; **2** only after a wsdb/ipc-runtime change; **3** only after an AVM/contract/constants change; **4**'s `yarn build` after any TS change.

### Symptoms → fixes

Fast triage when the bulk test fails during setup:

| Symptom                                                                                                                                              | Cause                                                                                                                                                                                | Fix                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `TypeError: NativeWorldState is not a constructor` (or `BaseNativeWorldState`), thrown from `world-state/dest/native/native_world_state_instance.js` | Stale `world-state`/`@aztec/native` `dest/` — merge-train changed the native world-state API (`@aztec/native` no longer exports `NativeWorldState`) but the compiled JS is pre-merge | `yarn build` (step 4) to recompile `dest/`. A cached `./bootstrap.sh build yarn-project` will **not** fix this — it restores the stale build. |
| `Cannot find module '@aztec/wsdb'` / `'@aztec/ipc-runtime'`                                                                                          | The portal deps aren't installed                                                                                                                                                     | steps 2 + `yarn install` (step 4)                                                                                                             |
| `NAPI binary not found for current platform`                                                                                                         | `nodejs_module.node` not where `findNapiBinary()` looks                                                                                                                              | `(cd barretenberg/ts && BUILD_CPP=0 ./scripts/copy_native.sh)`                                                                                |
| Test **reverts**: `expect(result.revertCode.isOK()).toBe(true)` fails, log shows `Reverted code: Reverted` and `Total instructions executed: 0`      | Stale `AvmTest` artifact — pre-merge bytecode embeds old constants/gas vs the rebuilt bb-avm/simulator, so the call reverts at dispatch                                              | step 3 (recompile `avm_test_contract`) + `yarn workspace @aztec/noir-test-contracts.js generate` + `yarn build`                               |

Note: `Total instructions executed: 0` prints even on a **healthy** passing run — that counter is a cosmetic metrics quirk, not a signal. The real health check is `revertCode` (OK vs Reverted) and a non-trivial `Proving (all)` time (a real bulk trace proves in ~4–5s; a truly empty one would be near-instant).

## Legacy vs new Pippenger is a runtime toggle — build once

The MSM implementation is selected at runtime by the `BB_MSM_LEGACY` env var, read once per process in `bb::scalar_multiplication::use_legacy_msm()` (`barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp`):

- **unset** → new MSM (`pippenger_fast`)
- **`BB_MSM_LEGACY=1`** → `legacy::pippenger`

So you do **not** build two binaries. Build `bb-avm` once, then run the benchmark twice — once with and once without `BB_MSM_LEGACY=1`. The test spawns `bb-avm` as a subprocess (`BB_PATH` in `avm_proving_tester.ts`), so the env var set on the jest process propagates to the prover.

## Run it the way CI runs it

CI's invocation (one line in `yarn-project/bootstrap.sh`):

```
ISOLATE=1:CPUS=16:MEM=16g BENCH_OUTPUT=bench-out/avm_bulk_test.bench.json \
  yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts
```

Locally (set `CPUS` to your real core count; do not oversubscribe):

```bash
# New Pippenger (default)
CPUS=15 BENCH_OUTPUT=/tmp/avm_new.bench.json \
  yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts

# Legacy Pippenger
BB_MSM_LEGACY=1 CPUS=15 BENCH_OUTPUT=/tmp/avm_legacy.bench.json \
  yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts
```

`run_test.sh` pins `RAYON_NUM_THREADS=1` and `TOKIO_WORKER_THREADS=1`, and maps `CPUS` → `HARDWARE_CONCURRENCY` (what bb's prover pool actually reads). `MEM=16g` is a container cgroup limit — a no-op locally as long as you keep ~16 GB+ free; the AVM bulk prove is memory-hungry. On macOS `run_test.sh` warns it can't reach docker/redis (log cache disabled) — harmless.

To just watch the pretty table without writing the GitHub-action JSON, drop `BENCH_OUTPUT` (the test always prints `metrics.toPrettyString()` in `afterAll`), or use `BENCH_OUTPUT_MD=<file>` for a markdown table.

## The per-stage breakdown

Stage timings come from `bb-avm`'s `AvmStat[]` output (`generateAvmProof`), mapped in `avm_proving_tester.ts::recordProverMetrics` and rendered under **Proving:** by `TestExecutorMetrics`:

| Pretty label                       | bb stat key                                      | MSM-bound?             |
| ---------------------------------- | ------------------------------------------------ | ---------------------- |
| Simulation (all)                   | `simulation/all`                                 | no                     |
| Trace generation (all)             | `tracegen/all`                                   | no                     |
| Proving (all)                      | `proving/all`                                    | partially              |
| Sumcheck                           | `prove/sumcheck`                                 | no                     |
| PCS                                | `prove/pcs_rounds`                               | **yes** (opening MSMs) |
| Log derivative inverse             | `prove/log_derivative_inverse_round`             | no                     |
| Log derivative inverse commitments | `prove/log_derivative_inverse_commitments_round` | **yes**                |
| Wire commitments                   | `prove/wire_commitments_round`                   | **yes**                |

For a legacy-vs-new Pippenger comparison, the signal lives in the **commitment stages** — Wire commitments, PCS, and Log-derivative-inverse commitments. Sumcheck and trace generation should be unchanged across the toggle and act as a sanity check that the two runs are otherwise comparable.

## A/B: legacy vs new

1. Set up once (Setup) and build `bb-avm`.
2. Run twice — default and `BB_MSM_LEGACY=1` — writing distinct `BENCH_OUTPUT` files.
3. Diff the commitment-stage entries between `/tmp/avm_new.bench.json` and `/tmp/avm_legacy.bench.json`. Each entry is `{name, value, unit}`; the proving stages above appear under their pretty names.

The GitHub-action JSON is a flat array of `{name, value, unit}` — easy to diff with `jq`:

```bash
jq -r '.[] | "\(.name)\t\(.value)"' /tmp/avm_new.bench.json | sort > /tmp/new.tsv
jq -r '.[] | "\(.name)\t\(.value)"' /tmp/avm_legacy.bench.json | sort > /tmp/legacy.tsv
diff -y /tmp/legacy.tsv /tmp/new.tsv
```

## Comparing across commits (e.g. before/after a merge-train merge)

To attribute a regression to a specific commit, rebuild only `bb-avm` at each commit and run the same test — the TS harness, artifacts, and world-state stack stay put, so only the prover binary varies:

```bash
git checkout <commit>
(cd barretenberg/cpp && cmake --build build --target bb-avm)   # incremental relink
CPUS=15 BENCH_OUTPUT=/tmp/avm_<commit>.bench.json \
  yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts
```

Caveat: if the commit you check out also changes AVM opcodes/constants or the `AvmTest` contract, the artifact from Setup step 3 may no longer match that binary and the tx can revert — recompile the contract (step 3) at that commit too, or the comparison is invalid.

## Local runs are noisy — average 3+ runs

Non-dedicated machines have variable load. Run each side at least 3× and average (5 is better and cheap — one run is ~6s). Watch for **thermal drift**: on a laptop, back-to-back runs creep slower as the machine warms, so interleave the two sides (A/B/A/B…) rather than all-A-then-all-B, and report medians. Relative (legacy-vs-new on the same box, close together) deltas are valid even when absolute numbers won't match the dashboard:

- `CPUS=15` ≠ CI's 16 → expect single-digit-% higher wall times.
- No `ISOLATE=1` container locally → whatever else the box is doing leaks in.
- Different CPU than the dashboard machine.
- **Low-power / battery mode flattens everything** (throttles frequency, parks high-perf cores) — check it's off before benchmarking.

So treat the output as **before/after deltas on this box**, not dashboard-absolute matches.

## Tips

- **Set `CPUS` to your real core count and don't oversubscribe.** `run_test.sh` pins rayon/tokio to 1 thread each, so all proving parallelism comes from `HARDWARE_CONCURRENCY` (= `CPUS`); there's no double-counting.
- **`bb` vs `bb-avm`.** The tester needs `bb-avm`. `cmake --build build --target bb` will not satisfy it — rebuild `bb-avm` after any C++ change you want measured (see `barretenberg/cpp/CLAUDE.md`).
- **Timeout** is 180s for the proving step (`TIMEOUT` in the test). On a slow machine bump it via the test or env.
- **Only changed AVM/ecc C++?** Just `ninja bb-avm` and rerun — no yarn-project rebuild needed. If the `AvmTest` contract, constants, or simulator fixtures changed, redo Setup step 3 (+ `generate` + `yarn build`) too.
- **Verify the toggle took effect.** Run once each way; if the commitment stages are identical to the nanosecond, the env var didn't reach the subprocess — confirm you set `BB_MSM_LEGACY=1` on the same command (not exported in a way the spawned process doesn't inherit).
- **Fastest input-only A/B (no jest, no world-state stack).** Dump a real input once with `BB_DEBUG_OUTPUT_DIR=/tmp/avm-dbg CPUS=15 yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts` → `/tmp/avm-dbg/avm-prove-001/avm_inputs.bin`, then run the prover directly against the same bin for each config: `HARDWARE_CONCURRENCY=15 [BB_MSM_LEGACY=1] ./barretenberg/cpp/build/bin/bb-avm avm_prove --avm-inputs <bin> -o /tmp/out`. This isolates exactly the binary + MSM toggle, but you lose the per-stage `TestExecutorMetrics` table (you get whole-prove wall time).
