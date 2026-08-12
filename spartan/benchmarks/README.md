# Nightly network benchmarks

Three benchmarks run against ephemeral networks on the `aztec-gke-private` GKE cluster and publish
their results to the network dashboard. This document describes the workflows, what each one
measures, and how results are published.

Documented against `next`. Scheduled workflows only fire from the repository's default branch, so
`next` is the branch that actually runs nightly — a benchmark change merged only to a release or
merge-train branch does not affect the nightly run.

| Benchmark | Workflow | Schedule | Env / namespace | `benchmarkType` |
| --- | --- | --- | --- | --- |
| Inclusion sweep | `nightly-bench-inclusion-sweep.yml` | 06:00 UTC daily | `bench-inclusion-sweep` / `bench-inclusion-sweep` | `ingress-inclusion` |
| Proving (simulated) | `nightly-spartan-bench.yml` | 06:00 UTC daily | `prove-n-tps-fake` / `prove-n-tps-fake` | `simulated-proving` |
| Proving (real) | `weekly-proving-bench.yml` | 06:00 UTC Mondays | `prove-n-tps-real` / `prove-n-tps-real` | `real-proving` |
| Block capacity | `nightly-spartan-bench.yml` | 06:00 UTC daily | `block-capacity` / `nightly-block-capacity` | `block-capacity` |

`nightly-spartan-bench.yml` carries two independent benchmarks (proving and block capacity) as
parallel job chains; they share only image selection and the CI3 wait gate.

## Shared shape

Every benchmark follows the same phases:

1. **Select image.** Resolve the nightly Docker image and the matching git ref. With no
   `workflow_dispatch` input the tag is `<version>-nightly.<YYYYMMDD>`, where `<version>` comes from
   `.release-please-manifest.json`, giving image `aztecprotocol/aztec:<tag>` and source ref `v<tag>`.
   The workflow then verifies the git tag resolves and that `docker manifest inspect` succeeds, so a
   missing nightly build fails fast instead of producing `ImagePullBackOff` later.
2. **Deploy.** `deploy-network.yml` deploys the environment's Helm/Terraform stack into its namespace.
3. **Wait for first L2 block.** `spartan/bootstrap.sh wait_for_l2_block <env>`. A freshly deployed
   rollup cannot produce a committee-backed block until
   `max(AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET, AZTEC_LAG_IN_EPOCHS_FOR_RANDAO) + 1` epochs have
   elapsed, so this step legitimately takes tens of minutes.
4. **Run the benchmark** via `./.github/ci3.sh <target>` with `SKIP_NETWORK_DEPLOY=1`.
5. **Scrape and publish** (inside the bench function, not the workflow).
6. **Teardown**, unconditionally (`if: always()`).
7. **Notify** `#alerts-next-scenario` on Slack. Failures on scheduled runs also dispatch a ClaudeBox
   investigation; `workflow_dispatch` runs stay silent.

All four workflows are guarded on `github.repository == 'aztec-labs-eng/aztec-node'` so they only
run there, and all use `concurrency` with `cancel-in-progress`.

### From workflow to test

`./.github/ci3.sh <target>` dispatches through `ci.sh`, which sets `CI_DASHBOARD=network`, a `JOB_ID`,
`CPUS=16` and `NO_SPOT=1`, then calls `bootstrap_ec2` to run the work on a dedicated EC2 instance.
The remote command is the root `bootstrap.sh ci-network-<target>` with `CI=1`, which builds the repo,
optionally deploys, and then calls the corresponding function in `spartan/bootstrap.sh`:

| CI3 target | Root bootstrap target | `spartan/bootstrap.sh` function | Test |
| --- | --- | --- | --- |
| `network-inclusion-sweep` | `ci-network-inclusion-sweep` | `bench_inclusion_point` | `n_tps.test.ts` |
| `network-proving-bench` | `ci-network-proving-bench` | `proving_bench` | `n_tps_prove.test.ts` |
| `network-block-capacity-bench` | `ci-network-block-capacity-bench` | `block_capacity_bench` | `block_capacity.test.ts` |

Tests live in `yarn-project/end-to-end/src/spartan/` and run through
`yarn-project/end-to-end/scripts/run_test.sh simple <test>`.

Each bench function captures the test's exit code, scrapes and publishes **regardless**, then
re-surfaces the code as its own return value. A degraded run still produced data worth keeping, but
the job status still reflects the failure.

## Inclusion sweep

Measures how long a properly-paying user's transaction takes to be included while the network runs at
a target load. Three points — **1, 5 and 10 TPS** — run sequentially against a **single** network.

Each point holds the measured lane at a fixed **1 TPS of high-value transactions** and makes up the
remainder with low-value background traffic (`LOW_VALUE_TPS = TARGET_TPS - 1`, clamped at 0). Inclusion
latency is therefore always measured for the same class of transaction, with only the competing load
changing between points.

- `select-image` computes a shared `sweep_id` of `incl-<YYYYMMDD>-<run_id>` so the dashboard groups the
  three points as one sweep.
- `deploy`, `wait` and `cleanup` happen **once**. Each point is a `workflow_call` into the reusable
  `bench-inclusion-point.yml` with `SKIP_NETWORK_DEPLOY=1`.
- Points are chained with `needs` so they never overlap — the scraper drains the mempool to zero
  between them. Each point is gated on `needs.wait.result == 'success'` and `!cancelled()` rather than
  on the previous point, so **a failed point drops only itself** while the rest of the sweep continues.
- Load window is 600 s per point (`TEST_DURATION_SECONDS`), with a 7200 s test timeout to absorb
  committee formation. The workflow step allows 120 minutes.

The 06:00 UTC schedule is deliberate: the nightly git tag and Docker image this sweep resolves are
produced by the nightly release-tag workflow at 04:00 UTC. Running earlier races that job and fails at
"Verify source git ref".

## Proving

Measures end-to-end proving throughput: transactions are sent at 1 TPS, then the test waits for the
**proven** chain to advance by a full epoch and collects proving-queue metrics from Prometheus (proven
transaction and block counters, plus the epoch-duration histogram).

Two variants share the same workflow plumbing, test and CI3 target, differing only in environment:

| | Simulated (nightly) | Real (weekly) |
| --- | --- | --- |
| Env / namespace | `prove-n-tps-fake` | `prove-n-tps-real` |
| `REAL_VERIFIER` | `false` | `true` |
| Proof generation | Fixed/realistic simulated delays (`PROVER_TEST_DELAY_TYPE=realistic`, `PROVER_TEST_VERIFICATION_DELAY_MS=250`) | Genuine proofs |
| `PROVER_RESOURCE_PROFILE` | `dev-hi-tps` | `prod-hi-tps` |
| Schedule | Daily | Mondays only |

The weekly real-proving run is the expensive one — it generates actual proofs, which is why it runs
once a week rather than nightly. Both use 32-slot epochs at 72 s, `AZTEC_PROOF_SUBMISSION_EPOCHS=1`,
and scale prover agents to a KEDA maximum of 200.

`proving_bench` derives `benchmarkType` from `REAL_VERIFIER` when `BENCH_BENCHMARK_TYPE` is unset, so a
local run is tagged correctly without extra configuration. Test timeout is 9000 s (2.5 h) with a 4 h
jest timeout; the workflow step allows 180 minutes.

## Block capacity

Measures how many transactions of a given shape fit in a block. The test fills blocks with batches of
one workload type at a time and records the per-block transaction counts.

| Workload | Transactions |
| --- | --- |
| `noop` | 100 |
| `noop_pub` | 100 |
| `emit_nullifiers` | 100 |
| `emit_note_hashes` | 100 |
| `emit_l2_to_l1_msgs` | 100 |
| `emit_private_logs` | 88 (blob space limit) |
| `emit_contract_class_log` | 8 |
| `transfer_in_public` | 100 |

The environment removes block-size limits as the constraint (`SEQ_MAX_TX_PER_BLOCK=72000`,
`SEQ_MIN_TX_PER_BLOCK=0`) so the protocol's own limits are what get measured. It runs a single
validator with 8-slot epochs and `AZTEC_PROOF_SUBMISSION_EPOCHS=4`.

Note the namespace is **`nightly-block-capacity`**, which differs from the env file's default
`NAMESPACE` of `block-capacity`. Teardown and any manual `kubectl` work must use the namespace the
workflow actually deployed.

Test timeout is 7200 s (2 h) with a 60 min jest timeout; the workflow step allows 240 minutes — the
longest of the three.

## Publishing

Each bench function invokes `spartan/scripts/bench_10tps/bench_scrape.ts`, which builds a single
schema-conformant JSON document per run, validated against
`spartan/scripts/bench_10tps/bench_output.schema.json`. The scraper reads from two independent
sources so one failing does not abort the other:

- **Prometheus**, via a port-forward to the cluster-shared `metrics-prometheus-server` service in the
  `metrics` namespace (not per-environment), sampled at a 15 s step.
- **`gcloud logging read`**, for per-block records and discrete events.

Document sections — `run`, `summary`, `timeSeries`, `blocks` and `events` are required;
`provingInfra`, `saturation`, `sequencerStateSlots` and `notes` are optional.

The scraper takes the measured window from a timing-metadata file the test writes:

| Test | Metadata file |
| --- | --- |
| `n_tps.test.ts` | `/tmp/n_tps_timing_data.json` |
| `n_tps_prove.test.ts` | `/tmp/n_tps_prove_timing_data.json` |
| `block_capacity.test.ts` | `/tmp/block_capacity_timing_data.json` |

For the inclusion sweep the same file also supplies the client-observed inclusion records
(`--inclusion-records`), and the scraper waits for pending TxPool depth to reach zero before
finalizing (`--wait-for-pending-zero`, default cap 3600 s) plus a 90 s drain buffer covering the OTel
batch push interval and one Prometheus scrape.

`network_bench_upload` in `spartan/bootstrap.sh` then publishes, guarded three ways:

- Uploads **only when `CI=1`** — local runs leave the JSON on disk and skip publishing entirely.
- **Rejects any document whose `schemaVersion` is not `5`**, rather than uploading something the index
  cannot describe.
- Writes the run as `<runId>.json` into a GCS bucket (path configurable via `NETWORK_BENCH_BUCKET`),
  then updates a sibling `index.json` manifest.

The manifest is `schemaVersion: "2"` with a `generatedAt` timestamp and a `runs` array carrying one
summary entry per run: `runId`, `path`, `startedAt`, `endedAt`, `targetTps`, `sweepId`, `sweepLabel`,
`benchmarkType`, `workload`, `testDurationSeconds`, `namespace`, `headlineKpi`, `inclusionTpsMean`,
`inclusionTpsPeak`, `totalTxsMined` and `reorgCount`. Entries are de-duplicated by `runId` and sorted
by `endedAt` descending, so a re-run replaces rather than duplicates its predecessor.

The index update probes for the existing object first and distinguishes "not yet created" (seed an
empty index) from a real error such as auth or permission failure (fail closed). Without that
distinction a transient GCS error would silently replace a healthy index with a single-entry one.

The dashboard that renders these is maintained separately and gates on the run schema version, so a
version bump requires a corresponding dashboard change before new fields appear — the upload itself
keeps working regardless.

### Schema versioning

Old documents keep the version they were written with, so the dashboard can render historical runs
side-by-side with current ones.

| Version | Change |
| --- | --- |
| v3 | `timeSeries` entries carry `series: [{labels, points}]` rather than bare `points` |
| v4 | Adds optional `provingInfra` and `saturation` sections, plus `run.sweepId` / `run.sweepLabel` so a night's points group as one sweep |
| v5 | Adds `run.benchmarkType` so a day's sweeps can be grouped by kind |

v4 and v5 are additive — all prior fields are retained.

## Running locally

From `spartan/`, against a network you have already deployed, with a registry-pullable image:

```bash
NS=bench-inclusion-sweep
AZTEC_DOCKER_IMAGE=<image> NAMESPACE=$NS ./bootstrap.sh network_deploy bench-inclusion-sweep
NAMESPACE=$NS ./bootstrap.sh wait_for_l2_block bench-inclusion-sweep

# One inclusion point
NAMESPACE=$NS TARGET_TPS=5 ./bootstrap.sh bench_inclusion_point bench-inclusion-sweep

# Proving / block capacity
NAMESPACE=prove-n-tps-fake     ./bootstrap.sh proving_bench        prove-n-tps-fake
NAMESPACE=nightly-block-capacity ./bootstrap.sh block_capacity_bench block-capacity

NAMESPACE=$NS ./scripts/network_teardown.sh
```

Points to be aware of when running by hand:

- **`CI` must be unset** (it is, locally) or the run will attempt to publish to the shared bucket and
  index.
- **The local build must match the deployed image.** Tests run from the local working tree's compiled
  output, so a client built from a different release line than the deployed node can fail during setup
  in ways that look like network faults. Check out the tag the image was built from and rebuild.
- **Each bench function starts with `rm -rf bench-out`** in `spartan/`. Back up a previous run's JSON
  before starting another, and note that the default `BENCH_RUN_ID` is derived from the date, benchmark
  and commit — so two runs of the same point on the same day at the same commit produce the same
  filename.
- **ci3 swallows test output** on success; the wrapper log goes quiet after
  `Starting parallel run with max 1 jobs...` until the run finishes. Set `DUMP_FAIL=1` to have the
  captured log printed on failure. Locally the `ci.aztec-labs.com` link in the output is empty, since
  logs are only uploaded under `CI=1`.

## Known issues

**Stale timing metadata can be republished as a new run.** The bench functions scrape whenever the
timing-metadata file exists and do not check that its `runId` matches `BENCH_RUN_ID`. A test that
fails before writing the file leaves the previous run's metadata in place, and the scraper will happily
build a complete, plausible-looking document from it — with the previous run's measurement window and
records — and publish it under the new run's id. Deleting the metadata file at the start of each bench
function, or having the scraper refuse on an id mismatch, would close this.
