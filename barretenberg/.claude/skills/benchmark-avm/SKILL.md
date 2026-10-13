---
name: benchmark-avm
description: Run the AVM full-proving benchmark (avm_bulk.test.ts) locally and get per-stage proving timings, including legacy-vs-new Pippenger MSM A/B via the BB_MSM_LEGACY env toggle. Use when measuring or comparing AVM proving performance, or attributing time to commitment/MSM stages.
argument-hint: <action> e.g. "run", "legacy", "ab", "build", "setup"
---

# Benchmark AVM (local full proving)

Run the **AVM full-proving** benchmark — the same one CI tracks on the benchmark dashboard — locally, and read its per-stage proving breakdown. This is the AVM analogue of `/benchmark-chonk`.

The benchmark is a jest test in the `labs/` submodule (aztec-labs-eng/aztec-node): `labs/yarn-project/bb-prover/src/avm_proving_tests/avm_bulk.test.ts`. It does **full AVM proving** (not check-circuit — see the comment at the top of the test): it runs `bulkTest()` against the `AvmTest` contract through the real prover and records per-stage timings into a `TestExecutorMetrics`.

The prover it runs is `labs/labs-aztec-toolchain/bin/bb-avm` (`BB_PATH` in `avm_proving_tester.ts`), driven through bb.js. Under `make labs-use-local` that path is a symlink to `barretenberg/cpp/build/bin/bb-avm`, so build `bb-avm` into `build/` (the link is hard-wired to that directory). If `bb-avm` did not exist when `labs-use-local` ran, re-run `make labs-use-local` to create the link.

## Setup

The bulk test simulates the `AvmTest` contract against a live world-state DB, then proves with `bb-avm`. The world state runs as a separate IPC process, `aztec-wsdb`. yarn-project reaches it through the `wsdb/` and `ipc-runtime/` packages, which `make labs-use-local` links in as portals. Do not run that linking by hand (root `CLAUDE.md` `<labs_build_tooling>`). Run from the repo root:

```bash
# 1. Build bb-avm into barretenberg/cpp/build/ (configured as in barretenberg/cpp/CLAUDE.md "Build").
#    The toolchain symlink points there, and labs-use-local creates it only if bb-avm exists.
(cd barretenberg/cpp && cmake --build build --target bb-avm)

# 2. Build what labs consumes from this tree (incl. wsdb, ipc-runtime, bb-ts), link the portals, build labs/yarn-project.
make labs-yarn-project

# 3. Refresh the AVM test contract artifact and regenerate its TS wrapper. Changes to constants.nr / AVM opcodes
#    make a stale AvmTest bytecode revert immediately (see "reverts" below).
scripts/labs_env.sh bash -c 'cd noir-projects/noir-contracts && ./bootstrap.sh build avm_test_contract'
scripts/labs_env.sh bash -c 'cd yarn-project && yarn workspace @aztec-labs/noir-test-contracts.js generate && yarn build'
```

Re-run step 1 after a C++ change, step 3 after an AVM/contract/constants change, and `yarn build` after any TS change.

### Symptoms → fixes

Fast triage when the bulk test fails during setup:

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Cannot find module '@aztec-foundation/wsdb'` / `'@aztec-foundation/ipc-runtime'` | The portals are not linked | `make labs-use-local` (or step 2) |
| Test **reverts**: `expect(result.revertCode.isOK()).toBe(true)` fails, log shows `Reverted code: Reverted` and `Total instructions executed: 0` | Stale `AvmTest` artifact: its bytecode embeds old constants/gas against the rebuilt bb-avm/simulator, so the call reverts at dispatch | Step 3 |
| `NAPI binary not found for current platform` | `nodejs_module.node` not where `findNapiBinary()` looks | `(cd barretenberg/ts/bb.js && BUILD_CPP=0 ./scripts/copy_native.sh)` |
| A world-state class "is not a constructor" from a `world-state/dest/...` file | Stale compiled `dest/`; a cached build restores it | `yarn build` in `labs/yarn-project` (step 3) |

Note: `Total instructions executed: 0` prints even on a **healthy** passing run — that counter is a cosmetic metrics quirk, not a signal. The real health check is `revertCode` (OK vs Reverted) and a non-trivial `Proving (all)` time (a real bulk trace proves in ~4–5s; a truly empty one would be near-instant).

## Legacy vs new Pippenger is a runtime toggle — build once

The MSM implementation is selected at runtime by the `BB_MSM_LEGACY` env var, read once per process in `bb::scalar_multiplication::use_legacy_msm()` (`barretenberg/cpp/src/barretenberg/ecc/scalar_multiplication/scalar_multiplication.cpp`):

- **unset** → new MSM (`pippenger_fast`)
- **set, to any value (including `0`)** → `legacy::pippenger`

So you do **not** build two binaries. Build `bb-avm` once, then run the benchmark twice — once with and once without `BB_MSM_LEGACY`. The test spawns `bb-avm` as a subprocess, so the env var set on the jest process propagates to the prover.

## Run it the way CI runs it

CI's invocation (one line in `labs/yarn-project/bootstrap.sh`):

```
ISOLATE=1:CPUS=16:MEM=16g BENCH_OUTPUT=bench-out/avm_bulk_test.bench.json \
  yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts
```

Locally, from the repo root (set `CPUS` to your real core count; do not oversubscribe):

```bash
# New Pippenger (default)
CPUS=15 BENCH_OUTPUT=/tmp/avm_new.bench.json \
  scripts/labs_env.sh yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts

# Legacy Pippenger
BB_MSM_LEGACY=1 CPUS=15 BENCH_OUTPUT=/tmp/avm_legacy.bench.json \
  scripts/labs_env.sh yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts
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
2. Run twice — without and with `BB_MSM_LEGACY=1` — writing distinct `BENCH_OUTPUT` files.
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
  scripts/labs_env.sh yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts
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

- **`bb` vs `bb-avm`.** The tester needs `bb-avm`. `cmake --build build --target bb` will not satisfy it — rebuild `bb-avm` after any C++ change you want measured (see `barretenberg/cpp/CLAUDE.md`).
- **Timeout** is 180s for the proving step (`TIMEOUT` in the test). On a slow machine bump it via the test or env.
- **Only changed AVM/ecc C++?** Just `ninja bb-avm` and rerun — no yarn-project rebuild needed. If the `AvmTest` contract, constants, or simulator fixtures changed, redo Setup step 3 too.
- **Verify the toggle took effect.** Run once each way; if the commitment stages are identical to the nanosecond, the env var didn't reach the subprocess — confirm you set `BB_MSM_LEGACY` on the same command (not exported in a way the spawned process doesn't inherit).
- **Fastest input-only A/B (no jest, no world-state stack).** Dump a real input once with `BB_DEBUG_OUTPUT_DIR=/tmp/avm-dbg CPUS=15 scripts/labs_env.sh yarn-project/scripts/run_test.sh bb-prover/src/avm_proving_tests/avm_bulk.test.ts` → `/tmp/avm-dbg/avm-prove-001/avm_inputs.bin`, then run the prover directly against the same bin for each config: `HARDWARE_CONCURRENCY=15 [BB_MSM_LEGACY=1] ./barretenberg/cpp/build/bin/bb-avm avm_prove --avm-inputs <bin> -o /tmp/out`. This isolates exactly the binary + MSM toggle, but you lose the per-stage `TestExecutorMetrics` table (you get whole-prove wall time).
