# 10 TPS readiness benchmark — spec (schema v4)

Canonical contract for the custom benchmark pipeline:
`bench_scrape.ts` → `gs://aztec-testnet/network_bench/<runId>.json` (+ `index.json`) → `network-dashboard` (in `AztecProtocol/explorations`).

This doc is the Phase 1 deliverable (Linear A-1221). It defines the tx-lifecycle stage list, the headline KPIs and their thresholds, and the sweep/run-group notion. The machine-readable contract is `bench_output.schema.json` (v4); the scraper that produces it is `bench_scrape.ts`.

## 1. tx-lifecycle stage waterfall

A tx's journey from client submit to epoch proof, each stage mapped to the Prometheus metric (from `yarn-project/telemetry-client/src/metrics.ts`) and where it lands in the run JSON. "ms" durations are histograms (use `_bucket` for quantiles, `_sum`/`_count` for means); never `sum(rate(...))` a metric every node observes — collapse per role with `avg`/`max` (see `network-dashboard/docs/dashboard-design.md`).

| # | Stage | Primary metric(s) | Run-JSON location |
|---|---|---|---|
| 1 | Submit / ingest | `aztec.node.receive_tx_count` (RPC only — load hits one node) | `timeSeries.ingressTps` |
| 2 | P2P propagation | `aztec.p2p.gossip.message_latency`, `agg_message_latency_p50/p90`, `tx_received_count` | `timeSeries` (gossip) |
| 3 | Mempool wait | `aztec.mempool.tx_count` (pending depth), `aztec.mempool.tx_mined_delay` | `timeSeries.mempoolSize*`, `mempoolMinedMax` |
| 4 | Block build | `aztec.sequencer.block.build_duration`, `build_mana_per_second` | `timeSeries`, `sequencerStateSlots` |
| 5 | Public processing | `aztec.public_processor.tx_duration`, `phase_duration`, `gas_rate` | `timeSeries.publicProcessorGasRate`; **prover-node copy** in `provingInfra.hintGen*` |
| 6 | Attestation / consensus | `aztec.mempool.attestations_mined_delay`; attestation-collect duration vs slot allowance | `timeSeries.attestationsCollect*` |
| 7 | Checkpoint assemble → broadcast | `aztec.archiver.checkpoint_height`, checkpoint block/tx counts | `timeSeries.checkpoint*` |
| 8 | L1 inclusion | `aztec.archiver.checkpoint_l1_inclusion_delay`, `l1_block_height`, `block_height` | `timeSeries`, `blocks` |
| 9 | Proving (epoch) | `aztec.prover_node.checkpoint_proving.duration`, `aztec.archiver.rollup_proof_delay`, `aztec.proving_queue.*` by `job_type`, prover-node block/checkpoint processing | `provingInfra.*` |

**Authoritative user-perceived latency** is client-observed, not Prometheus: `n_tps_test.tx_inclusion_time` (`timeSeries`, `source: client_observed`) — the wall-clock submit→mined delta for high-value txs, computed in the scraper from `n_tps.test.ts` records. Stages 1–8 explain *where* that latency is spent; stage 9 is the separate proving path.

## 2. Headline KPIs + pass/fail thresholds

Two independent verdicts — a run can pass inclusion and fail proving (or vice versa). Thresholds are starting points to refine against baselines; encode them in the dashboard, not the scraper (the scraper stays a faithful recorder).

| KPI | Definition | Pass threshold |
|---|---|---|
| **Inclusion-TPS achieved / target** | `summary.inclusionTpsMean / run.targetTps` | ≥ 0.95 |
| **User-perceived inclusion latency p50** | p50 of `tx_inclusion_time` | ≤ 1 × `AZTEC_SLOT_DURATION` |
| **User-perceived inclusion latency p99** | p99 of `tx_inclusion_time` | ≤ 3 × `AZTEC_SLOT_DURATION` |
| **Proving headroom** | does each epoch's proof land within `AZTEC_PROOF_SUBMISSION_EPOCHS` of epoch close (no proof-window-expiry reorg)? | every epoch proven in window; `reorgCount` from window-expiry = 0 |
| **Reorgs** | `summary.reorgCount` | 0 |

"Proving headroom" is the proving knee = distance from 10 TPS: the highest `targetTps` at which every epoch still proves within its window. Below the knee, headroom is positive; above it, epochs miss the window and the pending chain is pruned (the run #95 failure mode).

## 3. Sweep / run-group notion

A night's 1/5/10 TPS points are distinct runs (distinct namespaces — queries are namespace-scoped, one run per namespace) that the dashboard must view together. Grouping fields (schema v4, on `run` + mirrored into `index.json`):

- `run.sweepId` — shared id across the points of one sweep (e.g. `incl-20260623`). Set via `--sweep-id` / `BENCH_SWEEP_ID`.
- `run.sweepLabel` — human label (e.g. `inclusion-sweep`, `proving-sweep`). `--sweep-label` / `BENCH_SWEEP_LABEL`.
- `run.targetTps` — the point within the sweep (already present in v3).

`index.json` entries carry `sweepId`/`sweepLabel`/`targetTps` so the dashboard can group + order points without fetching every run JSON.

## 4. schema v4 additions (additive over v3)

All v3 fields retained; a v3-shaped run re-stamped `"4"` still validates (the new sections are optional). New:

- `provingInfra` (`metricSeriesMap`): prover-node hint-gen (`public_processor.*` + `prover_node.*_processing.duration` scoped to the prover-node pod) and proving-queue series broken down by `aztec_proving_job_type` (size / active / job_duration p50·p99 / timed-out · resolved rates). **Note:** there is no `aztec.prover_node.execution.duration` metric — hint-gen is the `public_processor.*` re-execution on the prover-node pod, mapped accordingly.
- `saturation` (`metricSeriesMap`): per-role ELU / CPU / memory, each as **max (hottest pod)** and **avg**, for validator / rpc / fullNode / proverNode / broker / agent. Never a single hand-picked pod. ELU = `nodejs_eventloop_utilization`, memory = `nodejs_memory_v8_heap_usage` (both `nodejs.*`, not `aztec_`); CPU = `process_cpu_utilization` (from `@opentelemetry/host-metrics`).
- `run.sweepId` / `run.sweepLabel` (§3).

### Version gate — three places, must stay in sync

Bumping the schema version requires updating all three or v4 runs are silently rejected / mis-rendered:

1. `bench_output.schema.json` — `schemaVersion.const` (✅ `"4"`).
2. `spartan/bootstrap.sh` — `network_bench_upload` schemaVersion check (✅ `"4"`).
3. **`network-dashboard/data.js` `SUPPORTED_RUN_VERSION`** — in `AztecProtocol/explorations`, **not this repo**. Must be bumped to `"4"` there before v4 runs render. Tracked as dashboard work (Phase 5).

## 5. Verify-on-live caveats (A-1222 acceptance)

- **CPU** (`process_cpu_utilization`) and **ELU** (`nodejs_eventloop_utilization`) come from telemetry that may be gated in the bench env. The scraper emits empty series (non-fatal) if a metric is absent; confirm both flow on a live bench run and fix the exporter/metric name if not.
- Proving-infra durations are recorded in **ms** by convention; confirm units against the live histograms before trusting absolute values.
