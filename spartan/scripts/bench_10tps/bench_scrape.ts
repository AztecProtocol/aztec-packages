#!/usr/bin/env -S node --experimental-strip-types --no-warnings
//
// Scrape a completed bench-10tps run into a schema-conformant JSON payload.
// Contract: bench_output.schema.json (v4). Invoked by the bench_10tps function
// in spartan/bootstrap.sh after n_tps.test.ts finishes.
//
// v4 adds two PromQL sections alongside the inclusion timeSeries:
//   - provingInfra: prover-node hint-gen (tx re-execution) + proving-queue
//     behaviour broken down by job_type.
//   - saturation:   per-role ELU/CPU/memory, each as max (hottest pod) + avg.
// Both scrape independently so one failing does not abort the others.
//
// Two independent scrape paths so one failing does not abort the other:
//   1. Prometheus (port-forward to the cluster-shared metrics-prometheus-server)
//   2. gcloud logging read (per-block and discrete-event records)
//
// Usage:
//   ./bench_scrape.ts \
//     --run-id <id> --started <iso> --ended <iso> \
//     --target-tps 10 --workload sha256_hash_1024
//
// By default the scraper waits for pending TxPool depth to reach zero before
// finalizing the run. Use --no-wait-for-pending-zero for historical replays
// where the namespace no longer exists.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argv, env, exit, stderr } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

// --- Config ---

const NAMESPACE = env.NAMESPACE ?? "bench-10tps";

const GCP_PROJECT_ID = env.GCP_PROJECT_ID;
if (!GCP_PROJECT_ID) {
  throw new Error("Missing GCP_PROJECT_ID env var");
}

const GCP_REGION = env.GCP_REGION ?? "us-west1-a";
const GKE_CLUSTER = env.CLUSTER ?? "aztec-gke-private";
// Prometheus is cluster-shared in the "metrics" namespace, not per-environment.
const PROM_NS = env.PROM_NS ?? "metrics";
const PROM_SERVICE = env.PROM_SERVICE ?? "metrics-prometheus-server";
const PROM_PORT = Number(env.PROM_PORT ?? 9090);
const STEP_SECONDS = 15;
const DRAIN_BUFFER_SECONDS = 90; // OTel batch push 60s + one Prom scrape 15s + slack
const PENDING_POLL_SECONDS = 30;
const DEFAULT_MAX_PENDING_WAIT_SECONDS = 60 * 60;
const GCLOUD_LOG_FRESHNESS = env.BENCH_SCRAPE_GCLOUD_LOG_FRESHNESS ?? "2d";

// --- CLI ---

type Args = {
  runId: string;
  startedAt: string;
  endedAt: string;
  targetTps: number;
  workload: string;
  output: string | undefined;
  inclusionRecords: string | undefined;
  waitForPendingZero: boolean;
  maxPendingWaitSeconds: number;
  sweepId: string | undefined;
  sweepLabel: string | undefined;
};

function parseArgs(): Args {
  const get = (flag: string, fallback?: string) => {
    const i = argv.indexOf(flag);
    if (i === -1) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw new Error(`Missing required flag ${flag}`);
    }
    return argv[i + 1];
  };
  return {
    runId: get("--run-id", env.BENCH_RUN_ID ?? randomUUID()),
    startedAt: get("--started"),
    endedAt: get("--ended"),
    targetTps: Number(get("--target-tps", "10")),
    workload: get("--workload", "sha256_hash_1024"),
    output:
      argv.indexOf("--output") === -1
        ? undefined
        : argv[argv.indexOf("--output") + 1],
    inclusionRecords:
      argv.indexOf("--inclusion-records") === -1
        ? undefined
        : argv[argv.indexOf("--inclusion-records") + 1],
    waitForPendingZero:
      !argv.includes("--no-wait-for-pending-zero") &&
      (argv.includes("--wait-for-pending-zero") ||
        env.BENCH_SCRAPE_WAIT_FOR_PENDING_ZERO !== "0"),
    maxPendingWaitSeconds: Number(
      get(
        "--max-pending-wait-seconds",
        env.BENCH_SCRAPE_MAX_PENDING_WAIT_SECONDS ??
          String(DEFAULT_MAX_PENDING_WAIT_SECONDS),
      ),
    ),
    sweepId: get("--sweep-id", env.BENCH_SWEEP_ID ?? "") || undefined,
    sweepLabel: get("--sweep-label", env.BENCH_SWEEP_LABEL ?? "") || undefined,
  };
}

function log(msg: string, extra?: unknown): void {
  stderr.write(
    `[scrape] ${msg}${extra === undefined ? "" : " " + JSON.stringify(extra)}\n`,
  );
}

// --- Port-forward ---

async function portForwardProm(): Promise<() => void> {
  const child = spawn(
    "kubectl",
    ["-n", PROM_NS, "port-forward", `svc/${PROM_SERVICE}`, `${PROM_PORT}:80`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise<void>((resolve, reject) => {
    const onData = (buf: Buffer) => {
      if (buf.toString().includes("Forwarding from")) {
        resolve();
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code, signal) =>
      reject(new Error(`port-forward exited: ${code}/${signal}`)),
    );
    setTimeout(() => reject(new Error("port-forward timeout")), 15_000);
  });
  return () => child.kill();
}

// --- PromQL client ---

type TsPoint = {
  unixEpoch: number;
  value: number | null;
};

type SeriesEntry = {
  labels: Record<string, string>;
  points: TsPoint[];
};

// --- Inclusion records (client-observed per-tx timing from n_tps.test.ts) ---

// Subset of TxInclusionData (yarn-project/.../tx_metrics.ts) that we care
// about. Records are emitted into /tmp/n_tps_timing_data.json under the
// `inclusionRecords` key, filtered to the high-value group, so this is the
// authoritative client-observed inclusion-latency dataset for the run.
type InclusionRecord = {
  txHash: string;
  sentAtMs: number;
  minedAtMs: number;
  blocknumber: number;
};

async function loadInclusionRecords(
  path: string | undefined,
): Promise<InclusionRecord[]> {
  if (!path) return [];
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as {
      inclusionRecords?: InclusionRecord[];
    };
    const records = parsed.inclusionRecords ?? [];
    log(`Loaded ${records.length} inclusion records`, { path });
    return records;
  } catch (err) {
    log("inclusion records load failed", {
      path,
      err: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// Nearest-rank quantile. Returns null on empty input.
function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function deltasMs(records: InclusionRecord[]): number[] {
  const out: number[] = [];
  for (const r of records) {
    if (r.sentAtMs > 0 && r.minedAtMs > 0) {
      const d = r.minedAtMs - r.sentAtMs;
      if (d > 0) out.push(d);
    }
  }
  return out;
}

function inclusionLatencyScalarMs(
  records: InclusionRecord[],
  p: number,
): number | null {
  const sorted = deltasMs(records).sort((a, b) => a - b);
  return quantile(sorted, p);
}

// Bin records by sentAt minute, compute per-bin quantile. Matches the
// `[1m]` window semantics the old Prom-based tx_mined_delay queries used.
function inclusionLatencyTimeSeriesPoints(
  records: InclusionRecord[],
  startedAtEpoch: number,
  endedAtEpoch: number,
  p: number,
  bucketSec = 60,
): TsPoint[] {
  const bins = new Map<number, number[]>();
  for (const r of records) {
    if (r.sentAtMs <= 0 || r.minedAtMs <= 0) continue;
    const sentSec = Math.floor(r.sentAtMs / 1000);
    if (sentSec < startedAtEpoch || sentSec > endedAtEpoch) continue;
    const d = r.minedAtMs - r.sentAtMs;
    if (d <= 0) continue;
    const bin = Math.floor(sentSec / bucketSec) * bucketSec;
    const arr = bins.get(bin) ?? [];
    arr.push(d);
    bins.set(bin, arr);
  }
  const points: TsPoint[] = [];
  for (const bin of [...bins.keys()].sort((a, b) => a - b)) {
    const arr = bins.get(bin)!.sort((a, b) => a - b);
    points.push({ unixEpoch: bin, value: quantile(arr, p) });
  }
  return points;
}

function buildInclusionLatencyTimeSeries(
  records: InclusionRecord[],
  startedAtEpoch: number,
  endedAtEpoch: number,
  p: number,
): {
  metric: string;
  unit: string;
  source: string;
  query: string;
  stepSeconds: number;
  series: SeriesEntry[];
} {
  return {
    metric: "n_tps_test.tx_inclusion_time",
    unit: "ms",
    source: "client_observed",
    query: `n_tps.test.ts inclusionRecords (group=tx_inclusion_time), quantile=${p}, 60s bins by sentAtMs`,
    stepSeconds: 60,
    series: [
      {
        labels: {},
        points: inclusionLatencyTimeSeriesPoints(
          records,
          startedAtEpoch,
          endedAtEpoch,
          p,
        ),
      },
    ],
  };
}

const parseValue = (v: string | undefined): number | null =>
  v === undefined || v === "NaN" ? null : Number(v);

async function queryInstant(
  promql: string,
  tEpoch: number,
): Promise<number | null> {
  const url =
    `http://localhost:${PROM_PORT}/api/v1/query` +
    `?query=${encodeURIComponent(promql)}&time=${tEpoch}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`instant query ${res.status} ${res.statusText}: ${promql}`);
  }
  const json = (await res.json()) as {
    data?: { result?: Array<{ value?: [number, string] }> };
  };
  return parseValue(json.data?.result?.[0]?.value?.[1]);
}

async function queryRange(
  promql: string,
  startEpoch: number,
  endEpoch: number,
  stepSeconds = STEP_SECONDS,
): Promise<SeriesEntry[]> {
  const url =
    `http://localhost:${PROM_PORT}/api/v1/query_range` +
    `?query=${encodeURIComponent(promql)}` +
    `&start=${startEpoch}&end=${endEpoch}&step=${stepSeconds}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`range query ${res.status} ${res.statusText}: ${promql}`);
  }
  const json = (await res.json()) as {
    data?: {
      result?: Array<{
        metric?: Record<string, string>;
        values?: Array<[number, string]>;
      }>;
    };
  };
  const results = json.data?.result ?? [];
  return results.map(({ metric, values }) => ({
    labels: metric ?? {},
    points: (values ?? []).map(([t, v]) => ({
      unixEpoch: Math.round(t),
      value: parseValue(v),
    })),
  }));
}

// --- Time-series definitions ---
// Every query includes the namespace filter: Prometheus is cluster-shared across
// all Aztec deployments, so un-filtered queries would pick up data from mbps-pipe,
// staging-v4-1, nightly-block-capacity, etc.

const NS = `{k8s_namespace_name="${NAMESPACE}"}`;
const pendingTxsQueryForRole = (role: string) =>
  `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",aztec_status="pending",k8s_pod_name=~"${NAMESPACE}-${role}.*"})`;
const PENDING_RPC_TXS_QUERY = pendingTxsQueryForRole("rpc");
const PENDING_VALIDATOR_TXS_QUERY = pendingTxsQueryForRole("validator");
const PENDING_FULL_NODE_TXS_QUERY = pendingTxsQueryForRole("full-node");
const histQuantile = (q: number, bucket: string, groupBy: string[] = []) => {
  const groupKeys = ["le", ...groupBy].join(", ");
  return `histogram_quantile(${q}, sum by (${groupKeys})(rate(${bucket}${NS}[1m])))`;
};

type TimeSeriesDef = { metric: string; unit: string; query: string };

type PreviousRunContext = {
  image?: string;
  aztecConfig?: Record<string, string>;
  infrastructure?: Infrastructure;
};

async function loadPreviousRunContext(
  output: string | undefined,
): Promise<PreviousRunContext> {
  if (!output) {
    return {};
  }
  try {
    const existing = JSON.parse(await readFile(output, "utf8")) as {
      run?: PreviousRunContext;
    };
    return existing.run ?? {};
  } catch {
    return {};
  }
}

const TIME_SERIES_DEFS: Record<string, TimeSeriesDef> = {
  // aztec_archiver_block_tx_count is a histogram where each observation is
  // "this block contained N txs" — _sum is total txs observed, _count is total
  // blocks observed. Every archiver (RPC + every validator + every full node)
  // observes the same block, so sum() across pods over-counts by the number of
  // archivers. avg() gives the true per-block rate since all archivers see the
  // same canonical chain.
  inclusionTps: {
    metric: "aztec_archiver_block_tx_count_sum",
    unit: "tps",
    query: `avg(rate(aztec_archiver_block_tx_count_sum${NS}[1m]))`,
  },
  // aztec_node_receive_tx_count is only incremented on the RPC node that the
  // load generator hits, so sum() is fine here — there's only one non-zero
  // series. (Full nodes receive via gossip, not ReceiveTx.)
  ingressTps: {
    metric: "aztec_node_receive_tx_count",
    unit: "tps",
    query: `sum(rate(aztec_node_receive_tx_count${NS}[1m]))`,
  },
  // Duration of the RPC node's receiveTx handler (aztec.node.receive_tx.duration,
  // a histogram). This is the tx-ingest cost on the submission path — the metric
  // to watch when RPC ingress is the bottleneck (climbs as the RPC saturates).
  ingressTxDurationP50: {
    metric: "aztec_node_receive_tx_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.5,
      "aztec_node_receive_tx_duration_milliseconds_bucket",
    ),
  },
  ingressTxDurationP99: {
    metric: "aztec_node_receive_tx_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.99,
      "aztec_node_receive_tx_duration_milliseconds_bucket",
    ),
  },
  // Pool-side pending->mined delay measured inside the tx pool
  // (aztec_mempool_tx_mined_delay, recorded as now - receivedAt at the mined
  // transition). This is the node's own view of how long txs sat in the mempool
  // before being mined, across ALL pool txs. Distinct from txMinedDelay* below,
  // which is the client-observed inclusion latency for the high-value lane only.
  // No aztec_pool_name filter needed: the attestation pool uses a different
  // metric name (aztec_mempool_attestations_mined_delay).
  mempoolTxMinedDelayP50: {
    metric: "aztec_mempool_tx_mined_delay_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.5,
      "aztec_mempool_tx_mined_delay_milliseconds_bucket",
    ),
  },
  mempoolTxMinedDelayP95: {
    metric: "aztec_mempool_tx_mined_delay_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_mempool_tx_mined_delay_milliseconds_bucket",
    ),
  },
  mempoolTxMinedDelayP99: {
    metric: "aztec_mempool_tx_mined_delay_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.99,
      "aztec_mempool_tx_mined_delay_milliseconds_bucket",
    ),
  },
  // Pending mempool size sliced by pod role. Three single-series slugs make cross-run
  // overlay clean: pod names are unstable (replica counts and restart suffixes
  // change between runs) but role is stable. Each query filters to TxPool to
  // avoid mixing in the AttestationPool counters that share the metric name, and
  // to pending status so max() does not collapse pending/protected/mined/softDeleted.
  // max() over a role collapses the per-pod fan-out — for an under-fill
  // investigation we care about the role's deepest backlog at any moment.
  mempoolSizeRpc: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",aztec_status="pending",k8s_pod_name=~"${NAMESPACE}-rpc.*"})`,
  },
  mempoolSizeValidator: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",aztec_status="pending",k8s_pod_name=~"${NAMESPACE}-validator.*"})`,
  },
  mempoolSizeFullNode: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",aztec_status="pending",k8s_pod_name=~"${NAMESPACE}-full-node.*"})`,
  },
  mempoolMinedMax: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",aztec_status="mined"})`,
  },
  mempoolEvictedByReasonRate: {
    metric: "aztec_mempool_tx_pool_v2_evicted_count",
    unit: "tps",
    query: `sum by (aztec_mempool_eviction_reason)(rate(aztec_mempool_tx_pool_v2_evicted_count${NS}[1m]))`,
  },
  mempoolRejectedByReasonRate: {
    metric: "aztec_mempool_tx_pool_v2_rejected_count",
    unit: "tps",
    // Rejections currently do not carry a reason label, unlike evictions.
    query: `sum(rate(aztec_mempool_tx_pool_v2_rejected_count${NS}[1m]))`,
  },
  blockBuildDurationP50: {
    metric: "aztec_sequencer_block_build_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.5,
      "aztec_sequencer_block_build_duration_milliseconds_bucket",
    ),
  },
  blockBuildDurationP95: {
    metric: "aztec_sequencer_block_build_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_sequencer_block_build_duration_milliseconds_bucket",
    ),
  },
  publicProcessorTxDurationP50: {
    metric: "aztec_public_processor_tx_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.5,
      "aztec_public_processor_tx_duration_milliseconds_bucket",
    ),
  },
  publicProcessorTxDurationP95: {
    metric: "aztec_public_processor_tx_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_public_processor_tx_duration_milliseconds_bucket",
    ),
  },
  publicProcessorGasRate: {
    metric: "aztec_public_processor_gas_rate_per_second",
    unit: "mana/s",
    // gas_rate is a histogram of per-block public-processor L2 mana/s. The
    // total_gas metric is a gauge, so rate(total_gas) is not meaningful.
    query: `sum(rate(aztec_public_processor_gas_rate_per_second_sum{k8s_namespace_name="${NAMESPACE}",aztec_gas_dimension="L2"}[1m])) / sum(rate(aztec_public_processor_gas_rate_per_second_count{k8s_namespace_name="${NAMESPACE}",aztec_gas_dimension="L2"}[1m]))`,
  },
  checkpointLastBlockToBroadcastP95: {
    metric:
      "aztec_sequencer_checkpoint_last_block_to_broadcast_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_sequencer_checkpoint_last_block_to_broadcast_duration_milliseconds_bucket",
    ),
  },
  // Archiver exports this as seconds into the L2 slot when the checkpoint L1
  // tx was included, not submit→mined latency. Convert to ms so the dashboard
  // can use the same duration formatting as the other build-internals panels.
  l1InclusionDelayP95: {
    metric: "aztec_archiver_checkpoint_l1_inclusion_delay_seconds",
    unit: "ms",
    query: `${histQuantile(0.95, "aztec_archiver_checkpoint_l1_inclusion_delay_seconds_bucket")} * 1000`,
  },
  // Multi-series by topic (tx, block_proposal, attestation, …).
  gossipLatencyP95: {
    metric: "aztec_p2p_gossip_message_latency_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_p2p_gossip_message_latency_milliseconds_bucket",
      ["aztec_gossip_topic_name"],
    ),
  },
  peerCountByRole: {
    metric: "aztec_peer_manager_peer_count_peers",
    unit: "count",
    query: `avg by (service_name)(aztec_peer_manager_peer_count_peers${NS})`,
  },
  peerCountByValidator: {
    metric: "aztec_peer_manager_peer_count_peers",
    unit: "count",
    query: `max by (k8s_pod_name)(aztec_peer_manager_peer_count_peers{k8s_namespace_name="${NAMESPACE}",k8s_pod_name=~"${NAMESPACE}-validator.*"})`,
  },
  attestationsCollectDurationMean: {
    metric: "aztec_sequencer_attestations_collect_duration_milliseconds",
    unit: "ms",
    // This metric is exported as a gauge, not a histogram.
    query: `avg(aztec_sequencer_attestations_collect_duration_milliseconds${NS})`,
  },
  attestationsCollectAllowanceMean: {
    metric: "aztec_sequencer_attestations_collect_allowance_milliseconds",
    unit: "ms",
    // The metric is declared/exported as milliseconds, but current sequencer
    // code records attestationTimeAllowed in seconds.
    query: `avg(aztec_sequencer_attestations_collect_allowance_milliseconds${NS}) * 1000`,
  },
  // Attester-side attestation failures, broken down by error_type. The
  // error_type=timeout slice is the signal that diagnosed the 10 TPS reorgs: an
  // attester that could not re-execute the proposed checkpoint in time, dragging
  // the committee below quorum. Summed across pods (validators emit this) so the
  // series is the network-wide failure rate per cause.
  attestationFailedNodeIssueByErrorTypeRate: {
    metric: "aztec_validator_attestation_failed_node_issue_count",
    unit: "tps",
    query: `sum by (aztec_error_type)(rate(aztec_validator_attestation_failed_node_issue_count${NS}[1m]))`,
  },
  // Attestations rejected because the proposal itself was bad (invalid_proposal,
  // state_mismatch, failed_txs, …) — distinct from the node-side issues above.
  attestationFailedBadProposalByErrorTypeRate: {
    metric: "aztec_validator_attestation_failed_bad_proposal_count",
    unit: "tps",
    query: `sum by (aztec_error_type)(rate(aztec_validator_attestation_failed_bad_proposal_count${NS}[1m]))`,
  },
  // Successful attestations, the denominator for a failure ratio.
  attestationSuccessRate: {
    metric: "aztec_validator_attestation_success_count",
    unit: "tps",
    query: `sum(rate(aztec_validator_attestation_success_count${NS}[1m]))`,
  },
  checkpointBlockCountMean: {
    metric: "aztec_sequencer_checkpoint_block_count",
    unit: "count",
    query: `avg(aztec_sequencer_checkpoint_block_count${NS})`,
  },
  checkpointTxCountMean: {
    metric: "aztec_sequencer_checkpoint_tx_count",
    unit: "count",
    query: `avg(aztec_sequencer_checkpoint_tx_count${NS})`,
  },
  // tx_collector signals: each node's view of where proposal txs came from.
  // These counters are emitted by every node reconstructing/validating blocks;
  // avg() keeps this as a per-node view instead of multiplying by node count.
  txCollectorTxsFromProposalRate: {
    metric: "aztec_tx_collector_txs_from_proposal_count",
    unit: "tps",
    query: `avg(rate(aztec_tx_collector_txs_from_proposal_count${NS}[1m]))`,
  },
  txCollectorTxsFromMempoolRate: {
    metric: "aztec_tx_collector_txs_from_mempool_count",
    unit: "tps",
    query: `avg(rate(aztec_tx_collector_txs_from_mempool_count${NS}[1m]))`,
  },
  txCollectorTxsFromP2pRate: {
    metric: "aztec_tx_collector_txs_from_p2p_count",
    unit: "tps",
    query: `avg(rate(aztec_tx_collector_txs_from_p2p_count${NS}[1m]))`,
  },
  txCollectorMissingRate: {
    metric: "aztec_tx_collector_missing_txs_count",
    unit: "tps",
    query: `avg(rate(aztec_tx_collector_missing_txs_count${NS}[1m]))`,
  },
  txCollectorRequestedFractionMean: {
    metric: "aztec_tx_collector_txs_requested_fraction",
    unit: "fraction",
    // Exported as a histogram even though the observation is already a fraction.
    query: `sum(rate(aztec_tx_collector_txs_requested_fraction_sum${NS}[1m])) / sum(rate(aztec_tx_collector_txs_requested_fraction_count${NS}[1m]))`,
  },
  txCollectorRequestDelayP95: {
    metric: "aztec_tx_collector_txs_requested_delay_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_tx_collector_txs_requested_delay_milliseconds_bucket",
    ),
  },
  // Time-in-state per sequencer state. Empty until the new image carrying
  // aztec.sequencer.state_duration ships to bench-10tps. Multi-series by state.
  sequencerStateDurationP95: {
    metric: "aztec_sequencer_state_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_sequencer_state_duration_milliseconds_bucket",
      ["aztec_sequencer_state"],
    ),
  },
};

// --- v4: per-role resource saturation (ELU / CPU / memory) ---
// Roles are matched by pod-name prefix within the namespace. The proposer
// rotates, so never hand-pick a pod: emit max() (hottest pod) AND avg() per role.
const SATURATION_ROLES: Record<string, string> = {
  validator: `${NAMESPACE}-validator.*`,
  rpc: `${NAMESPACE}-rpc.*`,
  fullNode: `${NAMESPACE}-full-node.*`,
  proverNode: `${NAMESPACE}-prover-node.*`,
  broker: `${NAMESPACE}-prover-broker.*`,
  agent: `${NAMESPACE}-prover-agent.*`,
};

// OTel metric -> Prometheus name. ELU + heap come from
// telemetry-client/src/nodejs_metrics_monitor.ts (nodejs.* prefix, NOT aztec_).
// CPU comes from @opentelemetry/host-metrics (process.cpu.utilization), not the
// nodejs monitor. NOTE: ELU and especially CPU may be telemetry-gated in the
// bench env — if so these series come back empty (A-1222 acceptance: verify on
// the live env and adjust the metric name / enable the exporter as needed).
const SATURATION_METRICS: { key: string; metric: string; unit: string }[] = [
  { key: "elu", metric: "nodejs_eventloop_utilization", unit: "ratio" },
  { key: "cpu", metric: "process_cpu_utilization", unit: "ratio" },
  // OTel exports the v8 heap gauge with a `_bytes` unit suffix.
  { key: "mem", metric: "nodejs_memory_v8_heap_usage_bytes", unit: "bytes" },
  // Event-loop delay (mean of the per-scrape distribution), raw nanoseconds. The
  // max-across-pods series surfaces the role's most event-loop-blocked pod — e.g.
  // the prover node, whose synchronous hint-gen blocks its main thread for seconds.
  {
    key: "eventLoopDelay",
    metric: "nodejs_eventloop_delay_mean_nanoseconds",
    unit: "ns",
  },
];

function buildSaturationDefs(): Record<string, TimeSeriesDef> {
  const defs: Record<string, TimeSeriesDef> = {};
  for (const [role, podPattern] of Object.entries(SATURATION_ROLES)) {
    const sel = `{k8s_namespace_name="${NAMESPACE}",k8s_pod_name=~"${podPattern}"}`;
    const cap = role.charAt(0).toUpperCase() + role.slice(1);
    for (const { key, metric, unit } of SATURATION_METRICS) {
      // max() across pods = hottest pod; avg() = role average. Single series each.
      defs[`${key}${cap}Max`] = { metric, unit, query: `max(${metric}${sel})` };
      defs[`${key}${cap}Avg`] = { metric, unit, query: `avg(${metric}${sel})` };
    }
  }
  return defs;
}
const SATURATION_DEFS = buildSaturationDefs();

// --- v4: proving-infra (hint-gen on the prover-node + proving-queue by job_type) ---
// "Hint generation" is the prover node re-executing the epoch's txs. There is no
// `aztec.prover_node.execution.duration` metric; the re-execution is instrumented
// as public_processor.* + prover_node.*_processing.duration on the prover-node
// pod. Proving-queue behaviour is broken down by the aztec_proving_job_type label.
const PROVER_NODE_SEL = `{k8s_namespace_name="${NAMESPACE}",k8s_pod_name=~"${NAMESPACE}-prover-node.*"}`;
const JOB_TYPE = "aztec_proving_job_type";
const proverNodeHist = (q: number, bucket: string) =>
  `histogram_quantile(${q}, sum by (le)(rate(${bucket}${PROVER_NODE_SEL}[1m])))`;
const queueByJobType = (metric: string) =>
  `sum by (${JOB_TYPE})(${metric}${NS})`;
const queueRateByJobType = (metric: string) =>
  `sum by (${JOB_TYPE})(rate(${metric}${NS}[1m]))`;
const queueHistByJobType = (q: number, bucket: string) =>
  `histogram_quantile(${q}, sum by (le, ${JOB_TYPE})(rate(${bucket}${NS}[1m])))`;

const PROVING_INFRA_DEFS: Record<string, TimeSeriesDef> = {
  // Hint-gen: prover-node tx re-execution (the proving bottleneck at high TPS).
  hintGenPublicTxDurationP50: {
    metric: "aztec_public_processor_tx_duration",
    unit: "ms",
    query: proverNodeHist(
      0.5,
      "aztec_public_processor_tx_duration_milliseconds_bucket",
    ),
  },
  hintGenPublicTxDurationP99: {
    metric: "aztec_public_processor_tx_duration",
    unit: "ms",
    query: proverNodeHist(
      0.99,
      "aztec_public_processor_tx_duration_milliseconds_bucket",
    ),
  },
  hintGenPublicPhaseDurationP50: {
    metric: "aztec_public_processor_phase_duration",
    unit: "ms",
    query: proverNodeHist(
      0.5,
      "aztec_public_processor_phase_duration_milliseconds_bucket",
    ),
  },
  hintGenBlockProcessingDurationP50: {
    metric: "aztec_prover_node_block_processing_duration",
    unit: "ms",
    query: proverNodeHist(
      0.5,
      "aztec_prover_node_block_processing_duration_milliseconds_bucket",
    ),
  },
  hintGenBlockProcessingDurationP99: {
    metric: "aztec_prover_node_block_processing_duration",
    unit: "ms",
    query: proverNodeHist(
      0.99,
      "aztec_prover_node_block_processing_duration_milliseconds_bucket",
    ),
  },
  hintGenCheckpointProcessingDurationP50: {
    metric: "aztec_prover_node_checkpoint_processing_duration",
    unit: "ms",
    query: proverNodeHist(
      0.5,
      "aztec_prover_node_checkpoint_processing_duration_milliseconds_bucket",
    ),
  },
  // Proving queue, broken down by job_type (one series per job type).
  provingQueueSizeByJobType: {
    metric: "aztec_proving_queue_size",
    unit: "count",
    query: queueByJobType("aztec_proving_queue_size"),
  },
  provingQueueActiveJobsByJobType: {
    metric: "aztec_proving_queue_active_jobs_count",
    unit: "count",
    query: queueByJobType("aztec_proving_queue_active_jobs_count"),
  },
  provingQueueJobDurationP50ByJobType: {
    metric: "aztec_proving_queue_job_duration",
    unit: "ms",
    query: queueHistByJobType(
      0.5,
      "aztec_proving_queue_job_duration_milliseconds_bucket",
    ),
  },
  provingQueueJobDurationP99ByJobType: {
    metric: "aztec_proving_queue_job_duration",
    unit: "ms",
    query: queueHistByJobType(
      0.99,
      "aztec_proving_queue_job_duration_milliseconds_bucket",
    ),
  },
  // Rates of terminal job outcomes — the run #95 stall showed up as timeouts.
  provingQueueTimedOutJobsByJobType: {
    metric: "aztec_proving_queue_timed_out_jobs_count",
    unit: "count",
    query: queueRateByJobType("aztec_proving_queue_timed_out_jobs_count"),
  },
  provingQueueResolvedJobsByJobType: {
    metric: "aztec_proving_queue_resolved_jobs_count",
    unit: "count",
    query: queueRateByJobType("aztec_proving_queue_resolved_jobs_count"),
  },
};

// Scrape a map of slug -> PromQL def via query_range. One failing query emits an
// empty series for that slug rather than aborting the whole section.
async function scrapeDefs(
  defs: Record<string, TimeSeriesDef>,
  startedAtEpoch: number,
  endedAtEpoch: number,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [slug, def] of Object.entries(defs)) {
    try {
      const series = await queryRange(def.query, startedAtEpoch, endedAtEpoch);
      out[slug] = {
        metric: def.metric,
        unit: def.unit,
        source: "promql",
        query: def.query,
        stepSeconds: STEP_SECONDS,
        series,
      };
    } catch (err) {
      log(`series.${slug} scrape failed, emitting empty series`, {
        err: err instanceof Error ? err.message : String(err),
      });
      out[slug] = {
        metric: def.metric,
        unit: def.unit,
        source: "promql",
        query: def.query,
        stepSeconds: STEP_SECONDS,
        series: [],
      };
    }
  }
  return out;
}

const scrapeTimeSeries = (startedAtEpoch: number, endedAtEpoch: number) =>
  scrapeDefs(TIME_SERIES_DEFS, startedAtEpoch, endedAtEpoch);

// --- gcloud log scrape ---

type GcloudEntry = {
  timestamp: string;
  jsonPayload?: Record<string, unknown>;
  resource?: { labels?: { pod_name?: string } };
};

async function gcloudRead(filter: string): Promise<GcloudEntry[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "gcloud",
      [
        "logging",
        "read",
        filter,
        "--project",
        GCP_PROJECT_ID,
        "--format=json",
        "--order=asc",
        `--freshness=${GCLOUD_LOG_FRESHNESS}`,
        "--limit=50000",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errChunks.push(c));
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `gcloud logging read exited ${code}: ${Buffer.concat(errChunks).toString()}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "[]"));
      } catch (err) {
        reject(err);
      }
    });
  });
}

const timeFilter = (startedAt: string, endedAt: string) =>
  `timestamp >= "${startedAt}" AND timestamp <= "${endedAt}"`;

// --- Run-context capture (image + aztec config env) ---

// CPU/memory requests and limits for a pod's main container, captured verbatim
// from the Kubernetes pod spec (e.g. {cpu: "3500m", memory: "12Gi"}). For the
// bench profiles request==limit (guaranteed QoS), so both are usually equal.
type ContainerResources = {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
};

type RoleNode = {
  role: string;
  podName: string;
  nodeName: string;
  instanceType?: string;
  nodePool?: string;
  resources?: ContainerResources;
};

type RoleInfrastructure = {
  instanceTypes: string[];
  nodePools: string[];
  resourceProfiles: ContainerResources[];
  nodes: RoleNode[];
};

type Infrastructure = {
  roles: Record<string, RoleInfrastructure>;
};

// Patterns are matched against the pod name with the namespace prefix removed
// and anchored with ^, so the L1 infra pods (eth-validator / eth-execution /
// eth-beacon) are not misread as aztec roles — an unanchored /-validator/ would
// match "<ns>-eth-validator-0".
const INFRASTRUCTURE_ROLE_PATTERNS = [
  { role: "validator", pattern: /^validator(?:-|$)/ },
  { role: "prover", pattern: /^prover-(?:agent|node|broker)(?:-|$)/ },
  { role: "rpc", pattern: /^rpc(?:-|$)/ },
  { role: "fullNode", pattern: /^full-node(?:-|$)/ },
];

// Curated subset of env vars worth recording per run so the dashboard can
// show e.g. "pool=20k vs pool=1000" alongside two compared runs. Anything not
// in this list is excluded — full env would be huge and mostly uninteresting.
const AZTEC_CONFIG_KEYS = [
  "SEQ_BLOCK_DURATION_MS",
  "SEQ_MAX_TX_PER_BLOCK",
  "SEQ_MAX_TX_PER_CHECKPOINT",
  "SEQ_BUILD_CHECKPOINT_IF_EMPTY",
  "AZTEC_MANA_TARGET",
  "P2P_MAX_PENDING_TX_COUNT",
  "AZTEC_EPOCH_DURATION",
  "AZTEC_SLOT_DURATION",
  "AZTEC_LAG_IN_EPOCHS_FOR_VALIDATOR_SET",
  "LOG_LEVEL",
];

async function runKubectl(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("kubectl", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errs: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errs.push(c));
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `kubectl ${args.join(" ")} exited ${code}: ${Buffer.concat(errs).toString()}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks).toString());
    });
  });
}

async function captureImage(): Promise<string | undefined> {
  try {
    const out = await runKubectl([
      "get",
      "statefulset",
      `${NAMESPACE}-validator`,
      "-n",
      NAMESPACE,
      "-o",
      'jsonpath={.spec.template.spec.containers[?(@.name=="aztec")].image}',
    ]);
    const trimmed = out.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (err) {
    log("image capture failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

async function captureAztecConfig(): Promise<Record<string, string>> {
  try {
    const out = await runKubectl([
      "exec",
      `${NAMESPACE}-validator-0`,
      "-c",
      "aztec",
      "-n",
      NAMESPACE,
      "--",
      "printenv",
    ]);
    const aztecConfig: Record<string, string> = {};
    for (const line of out.split("\n")) {
      const idx = line.indexOf("=");
      if (idx < 0) {
        continue;
      }
      const key = line.slice(0, idx);
      if (AZTEC_CONFIG_KEYS.includes(key)) {
        aztecConfig[key] = line.slice(idx + 1);
      }
    }
    return aztecConfig;
  } catch (err) {
    log("aztec config env capture failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

async function captureInfrastructure(): Promise<Infrastructure | undefined> {
  try {
    const [podsOut, nodesOut] = await Promise.all([
      runKubectl(["get", "pods", "-n", NAMESPACE, "-o", "json"]),
      runKubectl(["get", "nodes", "-o", "json"]),
    ]);
    const podsJson = JSON.parse(podsOut) as {
      items?: Array<{
        metadata?: { name?: string };
        spec?: {
          nodeName?: string;
          containers?: Array<{
            name?: string;
            resources?: ContainerResources;
          }>;
        };
      }>;
    };
    const nodesJson = JSON.parse(nodesOut) as {
      items?: Array<{
        metadata?: {
          name?: string;
          labels?: Record<string, string>;
        };
      }>;
    };

    const nodesByName = new Map(
      (nodesJson.items ?? [])
        .map((node) => {
          const name = node.metadata?.name;
          return name ? ([name, node.metadata?.labels ?? {}] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, Record<string, string>] =>
            entry !== null,
        ),
    );

    const roleNodes = (podsJson.items ?? [])
      .map((pod): RoleNode | undefined => {
        const podName = pod.metadata?.name;
        const nodeName = pod.spec?.nodeName;
        const role = podName ? roleForPodName(podName) : undefined;
        if (!podName || !nodeName || !role) {
          return undefined;
        }
        const labels = nodesByName.get(nodeName) ?? {};
        return {
          role,
          podName,
          nodeName,
          instanceType:
            labels["node.kubernetes.io/instance-type"] ??
            labels["beta.kubernetes.io/instance-type"],
          nodePool:
            labels["cloud.google.com/gke-nodepool"] ??
            labels["eks.amazonaws.com/nodegroup"],
          resources: resourcesForPod(pod.spec?.containers),
        };
      })
      .filter((node): node is RoleNode => node !== undefined)
      .sort((a, b) => a.podName.localeCompare(b.podName));

    if (roleNodes.length === 0) {
      return undefined;
    }

    const roles: Record<string, RoleInfrastructure> = {};
    for (const { role } of INFRASTRUCTURE_ROLE_PATTERNS) {
      const nodes = roleNodes.filter((node) => node.role === role);
      if (nodes.length === 0) {
        continue;
      }
      roles[role] = infrastructureForNodes(nodes);
    }
    return { roles };
  } catch (err) {
    log("infrastructure capture failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function roleForPodName(podName: string): string | undefined {
  const prefix = `${NAMESPACE}-`;
  if (!podName.startsWith(prefix)) {
    return undefined;
  }
  const suffix = podName.slice(prefix.length);
  return INFRASTRUCTURE_ROLE_PATTERNS.find(({ pattern }) =>
    pattern.test(suffix),
  )?.role;
}

// Resource requests/limits of a pod's main "aztec" container (falls back to the
// first container if none is named "aztec"). Returns undefined when the spec
// declares no resources, so a pod without sizing is simply omitted.
function resourcesForPod(
  containers:
    | Array<{ name?: string; resources?: ContainerResources }>
    | undefined,
): ContainerResources | undefined {
  const container =
    containers?.find((c) => c.name === "aztec") ?? containers?.[0];
  const resources = container?.resources;
  if (!resources) {
    return undefined;
  }
  const out: ContainerResources = {};
  if (resources.requests && Object.keys(resources.requests).length > 0) {
    out.requests = resources.requests;
  }
  if (resources.limits && Object.keys(resources.limits).length > 0) {
    out.limits = resources.limits;
  }
  return out.requests || out.limits ? out : undefined;
}

function infrastructureForNodes(nodes: RoleNode[]): RoleInfrastructure {
  // Pods of a role normally share one resource profile, but dedupe by content
  // so a mid-run resize or a stray pod surfaces as a second distinct profile
  // rather than being silently collapsed.
  const profilesByKey = new Map<string, ContainerResources>();
  for (const node of nodes) {
    if (node.resources) {
      profilesByKey.set(JSON.stringify(node.resources), node.resources);
    }
  }
  return {
    instanceTypes: Array.from(
      new Set(
        nodes.flatMap((node) => (node.instanceType ? [node.instanceType] : [])),
      ),
    ).sort(),
    nodePools: Array.from(
      new Set(nodes.flatMap((node) => (node.nodePool ? [node.nodePool] : []))),
    ).sort(),
    resourceProfiles: [...profilesByKey.values()],
    nodes,
  };
}

type BlockRecord = {
  blockNumber: number;
  blockNumberInTest: number;
  minedAt: string;
  successfulCount: number;
  failedCount: number;
  silentlySkippedCount: number;
  silentlySkippedDurationMs: number;
  buildDurationSeconds: number;
  totalPublicGas?: { daGas: number; l2Gas: number };
  totalSizeInBytes?: number;
  source: "log";
};

async function scrapeBlocks(
  startedAt: string,
  endedAt: string,
): Promise<BlockRecord[]> {
  const canonicalFilter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `resource.labels.pod_name=~"${NAMESPACE}-(validator|rpc).*"`,
    `jsonPayload.eventName="l2-block-handled"`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");
  const builtFilter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `resource.labels.pod_name=~"${NAMESPACE}-(validator|rpc).*"`,
    `jsonPayload.eventName="l2-block-built"`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");
  const processorFilter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `resource.labels.pod_name=~"${NAMESPACE}-(validator|rpc).*"`,
    `jsonPayload.message=~"^Processed [0-9]+ successful txs and"`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");

  const [canonicalEntries, builtEntries, processorEntries] = await Promise.all([
    gcloudRead(canonicalFilter),
    gcloudRead(builtFilter).catch((err) => {
      log("built-block log scrape failed, continuing without build durations", {
        err: err instanceof Error ? err.message : String(err),
      });
      return [] as GcloudEntry[];
    }),
    gcloudRead(processorFilter).catch((err) => {
      log(
        "public-processor log scrape failed, continuing without gas/silent-skip fields",
        {
          err: err instanceof Error ? err.message : String(err),
        },
      );
      return [] as GcloudEntry[];
    }),
  ]);

  const canonicalByBlock = dedupeBlockEntries(canonicalEntries, (entry) => ({
    blockNumber: numberPayloadField(entry.jsonPayload ?? {}, "blockNumber"),
    txCount: numberPayloadField(entry.jsonPayload ?? {}, "txCount"),
    time: Date.parse(entry.timestamp),
  }));
  const builtByBlock = entriesByBlock(builtEntries);
  const processorByBlock = entriesByBlock(processorEntries);

  if (canonicalByBlock.size === 0) {
    return [];
  }
  const blockNumbers = [...canonicalByBlock.keys()].sort((a, b) => a - b);
  const first = blockNumbers[0];

  return blockNumbers.map((bn) => {
    const canonical = canonicalByBlock.get(bn)!;
    const p = canonical.jsonPayload!;
    const txCount = finiteOrZero(numberPayloadField(p, "txCount"));
    const built = chooseBestMatchingEntry(
      builtByBlock.get(bn) ?? [],
      txCount,
      "txCount",
    );
    const processor = chooseBestMatchingEntry(
      processorByBlock.get(bn) ?? [],
      txCount,
      "successfulCount",
    );
    const processorPayload = processor?.jsonPayload;
    return {
      blockNumber: bn,
      blockNumberInTest: bn - first,
      minedAt: canonical.timestamp,
      successfulCount: txCount,
      failedCount: finiteOrZero(
        numberPayloadField(processorPayload ?? {}, "failedCount"),
      ),
      silentlySkippedCount: finiteOrZero(
        numberPayloadField(processorPayload ?? {}, "silentlySkippedCount"),
      ),
      silentlySkippedDurationMs: finiteOrZero(
        numberPayloadField(processorPayload ?? {}, "silentlySkippedDurationMs"),
      ),
      buildDurationSeconds:
        built?.jsonPayload === undefined
          ? finiteOrZero(numberPayloadField(processorPayload ?? {}, "duration"))
          : finiteOrZero(numberPayloadField(built.jsonPayload, "duration")) /
            1000,
      totalPublicGas: processorPayload?.totalPublicGas as
        | { daGas: number; l2Gas: number }
        | undefined,
      totalSizeInBytes:
        typeof processorPayload?.totalSizeInBytes === "number"
          ? processorPayload.totalSizeInBytes
          : undefined,
      source: "log",
    };
  });
}

type BlockEntryProjection = {
  blockNumber: number;
  txCount: number;
  time: number;
};

function dedupeBlockEntries(
  entries: GcloudEntry[],
  project: (entry: GcloudEntry) => BlockEntryProjection,
): Map<number, GcloudEntry> {
  const byBlock = new Map<
    number,
    { entry: GcloudEntry; projection: BlockEntryProjection }
  >();
  for (const entry of entries) {
    const projection = project(entry);
    if (
      !Number.isFinite(projection.blockNumber) ||
      !Number.isFinite(projection.txCount) ||
      !Number.isFinite(projection.time)
    ) {
      continue;
    }
    const prev = byBlock.get(projection.blockNumber);
    if (!prev || isBetterCanonicalBlockEntry(projection, prev.projection)) {
      byBlock.set(projection.blockNumber, { entry, projection });
    }
  }
  return new Map(
    [...byBlock.entries()].map(([blockNumber, value]) => [
      blockNumber,
      value.entry,
    ]),
  );
}

function isBetterCanonicalBlockEntry(
  candidate: BlockEntryProjection,
  previous: BlockEntryProjection,
): boolean {
  // Same tx count usually means the same block observed by another pod; keep
  // the earliest timestamp. Different tx count implies a distinct block at the
  // same height, so prefer the later observation as the best final-chain proxy.
  if (candidate.txCount !== previous.txCount) {
    return candidate.time > previous.time;
  }
  return candidate.time < previous.time;
}

function entriesByBlock(entries: GcloudEntry[]): Map<number, GcloudEntry[]> {
  const out = new Map<number, GcloudEntry[]>();
  for (const entry of entries) {
    const blockNumber = numberPayloadField(
      entry.jsonPayload ?? {},
      "blockNumber",
    );
    if (!Number.isFinite(blockNumber)) {
      continue;
    }
    const bucket = out.get(blockNumber) ?? [];
    bucket.push(entry);
    out.set(blockNumber, bucket);
  }
  return out;
}

function chooseBestMatchingEntry(
  entries: GcloudEntry[],
  txCount: number,
  txCountField: string,
): GcloudEntry | undefined {
  const candidates = entries.filter(
    (entry) =>
      numberPayloadField(entry.jsonPayload ?? {}, txCountField) === txCount,
  );
  const source = candidates.length > 0 ? candidates : entries;
  return source
    .filter((entry) => Number.isFinite(Date.parse(entry.timestamp)))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))[0];
}

function numberPayloadField(
  payload: Record<string, unknown>,
  key: string,
): number {
  const value = payload[key];
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return NaN;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

type ChainPrunedEvent = {
  at: string;
  type: "chainPruned";
  source: "log";
  fromBlock?: number;
  toBlock?: number;
};

type SlotSummaryEvent = {
  at: string;
  type: "slotSummary";
  source: "log";
  slotNumber: number;
  buildSlot?: number;
  checkpointNumber?: number;
  sourcePod?: string;
  proposer?: string;
  attestorAddress?: string;
  publisherAddress?: string;
  blocksBuilt?: number;
  txCount?: number;
  totalMana?: number;
  blockBuildFailures?: Array<Record<string, unknown>>;
  checkpointBuildFailure?: Record<string, unknown>;
  attestations?: Record<string, unknown>;
  publish?: Record<string, unknown>;
};

type Event = ChainPrunedEvent | SlotSummaryEvent;

type SequencerStateSlot = {
  slotNumber: number;
  startedAt: string;
  endedAt: string;
  sourcePod?: string;
  totalMs: number;
  states: Record<string, number>;
};

const CHAIN_PRUNED_MSG = /Chain pruned to block (\d+)/;

async function scrapeEvents(
  startedAt: string,
  endedAt: string,
  blocks: BlockRecord[],
): Promise<Event[]> {
  const [chainPruned, slotSummaries] = await Promise.all([
    scrapeChainPrunedEvents(startedAt, endedAt, blocks),
    scrapeSlotSummaryEvents(startedAt, endedAt),
  ]);
  return [...chainPruned, ...slotSummaries].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
}

async function scrapeChainPrunedEvents(
  startedAt: string,
  endedAt: string,
  blocks: BlockRecord[],
): Promise<ChainPrunedEvent[]> {
  const filter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `jsonPayload.message=~"Chain pruned to block [0-9]+"`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");
  const entries = await gcloudRead(filter);

  // Same real prune is logged by every node as they catch up — multiple log
  // lines with ms-spaced timestamps for the same toBlock. But toBlock is not a
  // unique key across a run: if proposals fail in consecutive slots after a
  // first prune, the chain can re-prune to the same block. Dedupe by (toBlock
  // within a 30s window of the earliest observation): preserves distinct
  // prune events, collapses the per-node log fan-out.
  const DEDUPE_WINDOW_MS = 30_000;
  const parsed = entries
    .map((entry) => {
      const msg = (entry.jsonPayload?.message as string | undefined) ?? "";
      const m = CHAIN_PRUNED_MSG.exec(msg);
      if (!m) {
        return null;
      }
      return {
        at: entry.timestamp,
        time: Date.parse(entry.timestamp),
        toBlock: Number(m[1]),
      };
    })
    .filter(
      (x): x is { at: string; time: number; toBlock: number } => x !== null,
    )
    .sort((a, b) => a.time - b.time);

  const deduped: typeof parsed = [];
  for (const e of parsed) {
    const sameEvent = deduped.find(
      (prev) =>
        prev.toBlock === e.toBlock && e.time - prev.time < DEDUPE_WINDOW_MS,
    );
    if (!sameEvent) {
      deduped.push(e);
    }
  }

  return deduped.map(({ at, time, toBlock }) => {
    // fromBlock is reconstructed because server_world_state_synchronizer.ts:459
    // doesn't log it structurally. Correlate with the latest block we've seen
    // at or before the prune timestamp.
    const before = blocks
      .filter((b) => Date.parse(b.minedAt) <= time)
      .reduce((max, b) => (b.blockNumber > max ? b.blockNumber : max), 0);
    return {
      at,
      type: "chainPruned" as const,
      source: "log" as const,
      fromBlock: before || undefined,
      toBlock,
    };
  });
}

async function scrapeSlotSummaryEvents(
  startedAt: string,
  endedAt: string,
): Promise<SlotSummaryEvent[]> {
  const filter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `resource.labels.pod_name=~"${NAMESPACE}-validator.*"`,
    `jsonPayload.eventName=~"^(benchmark-|sequencer-checkpoint-)"`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");
  const entries = await gcloudRead(filter);

  const bySlot = new Map<number, SlotSummaryEvent>();
  for (const entry of entries) {
    const p = entry.jsonPayload;
    const slotNumber = numberField(p?.slot);
    if (!p || !Number.isFinite(slotNumber)) {
      continue;
    }
    const eventName = normalizeSlotSummaryEventName(String(p.eventName ?? ""));
    if (eventName === undefined) {
      continue;
    }
    const event = getOrCreateSlotSummary(bySlot, slotNumber, entry);

    if (eventName === "slot-started") {
      assignDefined(event, {
        buildSlot: numberOrUndefined(p.buildSlot),
        checkpointNumber: numberOrUndefined(p.checkpointNumber),
        proposer: stringOrUndefined(p.proposer),
        attestorAddress: stringOrUndefined(p.attestorAddress),
        publisherAddress: stringOrUndefined(p.publisherAddress),
      });
    } else if (eventName === "checkpoint-built") {
      assignDefined(event, {
        buildSlot: numberOrUndefined(p.buildSlot),
        checkpointNumber: numberOrUndefined(p.checkpointNumber),
        proposer: stringOrUndefined(p.proposer),
        attestorAddress: stringOrUndefined(p.attestorAddress),
        publisherAddress: stringOrUndefined(p.publisherAddress),
        blocksBuilt: numberOrUndefined(p.blocksBuilt),
        txCount: numberOrUndefined(p.txCount),
        totalMana: numberOrUndefined(p.totalMana),
      });
    } else if (eventName === "block-build-failed") {
      event.blockBuildFailures ??= [];
      event.blockBuildFailures.push(
        compactObject({
          at: entry.timestamp,
          reason: stringOrUndefined(p.reason),
          blockNumber: numberOrUndefined(p.blockNumber),
          checkpointNumber: numberOrUndefined(p.checkpointNumber),
          indexWithinCheckpoint: numberOrUndefined(p.indexWithinCheckpoint),
          availableTxs: numberOrUndefined(p.availableTxs),
          minTxs: numberOrUndefined(p.minTxs),
          minValidTxs: numberOrUndefined(p.minValidTxs),
          numTxs: numberOrUndefined(p.numTxs),
        }),
      );
    } else if (eventName === "checkpoint-build-failed") {
      event.checkpointBuildFailure = compactObject({
        at: entry.timestamp,
        reason: stringOrUndefined(p.reason),
        checkpointNumber: numberOrUndefined(p.checkpointNumber),
        blocksBuilt: numberOrUndefined(p.blocksBuilt),
        minBlocksForCheckpoint: numberOrUndefined(p.minBlocksForCheckpoint),
      });
    } else if (
      eventName === "attestations-collected" ||
      eventName === "attestations-failed"
    ) {
      event.attestations = compactObject({
        status: eventName === "attestations-collected" ? "collected" : "failed",
        checkpointNumber: numberOrUndefined(p.checkpointNumber),
        committeeSize: numberOrUndefined(p.committeeSize),
        requiredAttestations: numberOrUndefined(p.requiredAttestations),
        collectedAttestations: numberOrUndefined(p.collectedAttestations),
        submittedAttestations: numberOrUndefined(p.submittedAttestations),
        missingValidatorCount: numberOrUndefined(p.missingValidatorCount),
        missingValidators: stringArrayOrUndefined(p.missingValidators),
        reason: stringOrUndefined(p.reason),
      });
    } else if (
      eventName === "checkpoint-published" ||
      eventName === "checkpoint-publish-failed"
    ) {
      event.publish = compactObject({
        status: eventName === "checkpoint-published" ? "published" : "failed",
        checkpointNumber: numberOrUndefined(p.checkpointNumber),
        successfulActions: stringArrayOrUndefined(p.successfulActions),
        failedActions: stringArrayOrUndefined(p.failedActions),
        sentActions: stringArrayOrUndefined(p.sentActions),
        expiredActions: stringArrayOrUndefined(p.expiredActions),
        reason: stringOrUndefined(p.reason),
      });
    }
  }

  return [...bySlot.values()].sort((a, b) => a.slotNumber - b.slotNumber);
}

function normalizeSlotSummaryEventName(eventName: string): string | undefined {
  if (eventName.startsWith("benchmark-")) {
    return eventName.slice("benchmark-".length);
  }
  if (!eventName.startsWith("sequencer-checkpoint-")) {
    return undefined;
  }

  const name = eventName.slice("sequencer-checkpoint-".length);
  const aliases: Record<string, string> = {
    built: "checkpoint-built",
    "build-failed": "checkpoint-build-failed",
    published: "checkpoint-published",
    "publish-failed": "checkpoint-publish-failed",
  };
  return aliases[name] ?? name;
}

function getOrCreateSlotSummary(
  bySlot: Map<number, SlotSummaryEvent>,
  slotNumber: number,
  entry: GcloudEntry,
): SlotSummaryEvent {
  const existing = bySlot.get(slotNumber);
  if (existing) {
    if (Date.parse(entry.timestamp) < Date.parse(existing.at)) {
      existing.at = entry.timestamp;
    }
    return existing;
  }
  const created: SlotSummaryEvent = {
    at: entry.timestamp,
    type: "slotSummary",
    source: "log",
    slotNumber,
    sourcePod: entry.resource?.labels?.pod_name,
  };
  bySlot.set(slotNumber, created);
  return created;
}

function assignDefined(
  target: Record<string, unknown>,
  values: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      target[key] = value;
    }
  }
}

function compactObject<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    if (obj[key] === undefined) {
      delete obj[key];
    }
  }
  return obj;
}

function numberOrUndefined(v: unknown): number | undefined {
  const n = numberField(v);
  return Number.isFinite(n) ? n : undefined;
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function stringArrayOrUndefined(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) {
    return undefined;
  }
  return v.map(String);
}

const SEQUENCER_STATE_MSG = /^Transitioning from ([A-Z_]+) to ([A-Z_]+)/;
const PROPOSER_STATE_SCORE = new Set([
  "INITIALIZING_CHECKPOINT",
  "WAITING_FOR_TXS",
  "CREATING_BLOCK",
  "WAITING_UNTIL_NEXT_BLOCK",
  "ASSEMBLING_CHECKPOINT",
  "COLLECTING_ATTESTATIONS",
  "PUBLISHING_CHECKPOINT",
]);

async function scrapeSequencerStateSlots(
  startedAt: string,
  endedAt: string,
): Promise<SequencerStateSlot[]> {
  const filter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `resource.labels.pod_name=~"${NAMESPACE}-validator.*"`,
    `jsonPayload.message=~"^Transitioning from "`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");
  const entries = await gcloudRead(filter);

  type PodSlot = {
    slotNumber: number;
    sourcePod?: string;
    startedAt: string;
    endedAt: string;
    firstTime: number;
    lastTime: number;
    states: Record<string, number>;
  };

  const byPodSlot = new Map<string, PodSlot>();

  for (const entry of entries) {
    const p = entry.jsonPayload;
    if (!p) {
      continue;
    }
    const message = String(p.message ?? "");
    const match = SEQUENCER_STATE_MSG.exec(message);
    const state =
      typeof p.oldState === "string" ? p.oldState : (match?.[1] ?? "");
    const slotNumber = numberField(p.stateSlotNumber);
    const durationMs = numberField(p.stateDurationMs);
    if (
      !state ||
      !Number.isFinite(slotNumber) ||
      !Number.isFinite(durationMs)
    ) {
      continue;
    }
    const time = Date.parse(entry.timestamp);
    if (!Number.isFinite(time)) {
      continue;
    }
    const podName = entry.resource?.labels?.pod_name;
    const key = `${podName ?? "unknown"}:${slotNumber}`;
    const current = byPodSlot.get(key);
    if (!current) {
      byPodSlot.set(key, {
        slotNumber,
        sourcePod: podName,
        startedAt: entry.timestamp,
        endedAt: entry.timestamp,
        firstTime: time,
        lastTime: time,
        states: { [state]: durationMs },
      });
      continue;
    }
    current.states[state] = (current.states[state] ?? 0) + durationMs;
    if (time < current.firstTime) {
      current.firstTime = time;
      current.startedAt = entry.timestamp;
    }
    if (time > current.lastTime) {
      current.lastTime = time;
      current.endedAt = entry.timestamp;
    }
  }

  // Multiple validator pods can log sequencer transitions for the same slot.
  // For the benchmark chart we want the proposer path, so choose the pod-slot
  // with the most time in checkpoint/block-production states.
  const bestBySlot = new Map<number, PodSlot>();
  for (const candidate of byPodSlot.values()) {
    const prev = bestBySlot.get(candidate.slotNumber);
    if (!prev || podSlotScore(candidate) > podSlotScore(prev)) {
      bestBySlot.set(candidate.slotNumber, candidate);
    }
  }

  return [...bestBySlot.values()]
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .map((slot) => {
      const totalMs = Object.values(slot.states).reduce((a, b) => a + b, 0);
      return {
        slotNumber: slot.slotNumber,
        startedAt: slot.startedAt,
        endedAt: slot.endedAt,
        ...(slot.sourcePod !== undefined && { sourcePod: slot.sourcePod }),
        totalMs,
        states: slot.states,
      };
    });
}

function podSlotScore(slot: { states: Record<string, number> }): number {
  let score = 0;
  for (const [state, durationMs] of Object.entries(slot.states)) {
    score += PROPOSER_STATE_SCORE.has(state) ? durationMs * 10 : durationMs;
  }
  return score;
}

function numberField(v: unknown): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : NaN;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

// --- Summary ---

const meanNonNull = (points: TsPoint[]): number | null => {
  const vals = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length === 0) {
    return null;
  }
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const maxNonNull = (points: TsPoint[]): number | null => {
  const vals = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  return vals.length === 0 ? null : Math.max(...vals);
};

type SummaryArgs = {
  targetTps: number;
  startedAtEpoch: number;
  inclusionEndedAtEpoch: number;
  windowSec: number;
  histogramWindowSec: number;
  endedAtEpoch: number;
  timeSeries: Record<string, { series: SeriesEntry[] }>;
  blocks: BlockRecord[];
  events: Event[];
  inclusionRecords: InclusionRecord[];
};

type BlockBuildPerTx = {
  blockBuildAvgTxsPerBlock: number | null;
  blockBuildPerTxMsAggregate: number | null;
  blockBuildMarginalMsPerTx: number | null;
  blockBuildFixedOverheadMsPerBlock: number | null;
};

// Decomposes block build time into a fixed per-block overhead and a marginal
// per-tx cost via an ordinary least-squares fit of build-ms against tx count
// over non-empty blocks (buildMs = fixed + marginal * txCount). The marginal
// slope is the (load-invariant) cost of adding one tx to a block; the intercept
// is the per-block overhead that grows with block size / system load. The
// aggregate is the simpler sum(buildMs)/sum(tx) — a single "build-ms per tx"
// headline. The OLS slope needs >= 2 blocks with differing tx counts, so
// marginal/fixed are null for a run with too few or uniform-width blocks.
function blockBuildPerTx(blocks: BlockRecord[]): BlockBuildPerTx {
  const pts = blocks
    .filter(
      (b) => b.successfulCount > 0 && Number.isFinite(b.buildDurationSeconds),
    )
    .map((b) => ({ x: b.successfulCount, y: b.buildDurationSeconds * 1000 }));
  if (pts.length === 0) {
    return {
      blockBuildAvgTxsPerBlock: null,
      blockBuildPerTxMsAggregate: null,
      blockBuildMarginalMsPerTx: null,
      blockBuildFixedOverheadMsPerBlock: null,
    };
  }
  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sxx - sx * sx;
  const marginal = n >= 2 && denom !== 0 ? (n * sxy - sx * sy) / denom : null;
  const fixed = marginal !== null ? (sy - marginal * sx) / n : null;
  return {
    blockBuildAvgTxsPerBlock: sx / n,
    blockBuildPerTxMsAggregate: sx > 0 ? sy / sx : null,
    blockBuildMarginalMsPerTx: marginal,
    blockBuildFixedOverheadMsPerBlock: fixed,
  };
}

async function buildSummary(a: SummaryArgs): Promise<Record<string, unknown>> {
  // inclusionTps is single-series; series[0] holds all points.
  const inclusionPoints = (
    a.timeSeries.inclusionTps?.series?.[0]?.points ?? []
  ).filter(
    (p) =>
      p.unixEpoch >= a.startedAtEpoch && p.unixEpoch <= a.inclusionEndedAtEpoch,
  );
  const inclusionBlocks = a.blocks.filter((b) => {
    const minedAtEpoch = Math.floor(Date.parse(b.minedAt) / 1000);
    return (
      Number.isFinite(minedAtEpoch) &&
      minedAtEpoch >= a.startedAtEpoch &&
      minedAtEpoch <= a.inclusionEndedAtEpoch
    );
  });
  const hasInclusionBlockRecords = inclusionBlocks.length > 0;
  const totalTxsMined = hasInclusionBlockRecords
    ? inclusionBlocks.reduce((s, b) => s + b.successfulCount, 0)
    : null;
  const promInclusionTpsMean = meanNonNull(inclusionPoints);
  const inclusionTpsMean =
    totalTxsMined !== null && a.windowSec > 0
      ? totalTxsMined / a.windowSec
      : promInclusionTpsMean;
  const inclusionTpsPeak = maxNonNull(inclusionPoints);

  if (!hasInclusionBlockRecords && promInclusionTpsMean !== null) {
    log(
      "No block records found in inclusion window; using Prometheus inclusion TPS mean for summary",
      {
        promInclusionTpsMean,
        inclusionPointCount: inclusionPoints.length,
      },
    );
  }

  const safeInstant = async (promql: string): Promise<number | null> => {
    try {
      return await queryInstant(promql, a.endedAtEpoch);
    } catch (err) {
      log("summary instant query failed", {
        err: err instanceof Error ? err.message : String(err),
        promql,
      });
      return null;
    }
  };

  const windowSpec = `${a.histogramWindowSec}s`;
  const oneShotQuantile = (q: number, bucket: string) =>
    `histogram_quantile(${q}, sum by (le)(rate(${bucket}${NS}[${windowSpec}])))`;

  // Inclusion-latency quantiles are now computed from per-tx client-observed
  // records emitted by n_tps.test.ts (high-value group only). The other
  // histogram-based scalars below still come from Prometheus.
  const inclLatP50 = inclusionLatencyScalarMs(a.inclusionRecords, 0.5);
  const inclLatP95 = inclusionLatencyScalarMs(a.inclusionRecords, 0.95);
  const inclLatP99 = inclusionLatencyScalarMs(a.inclusionRecords, 0.99);
  if (a.inclusionRecords.length === 0) {
    log("No inclusion records loaded; summary.inclusionLatencyP* will be null");
  }

  const [
    buildP50,
    buildP95,
    ppTxP50,
    ppTxP95,
    mempoolMinedP50,
    mempoolMinedP95,
    mempoolMinedP99,
    attestationFailedNodeIssueCount,
    attestationFailedBadProposalCount,
    attestationSuccessCount,
  ] = await Promise.all([
    safeInstant(
      oneShotQuantile(
        0.5,
        "aztec_sequencer_block_build_duration_milliseconds_bucket",
      ),
    ),
    safeInstant(
      oneShotQuantile(
        0.95,
        "aztec_sequencer_block_build_duration_milliseconds_bucket",
      ),
    ),
    safeInstant(
      oneShotQuantile(
        0.5,
        "aztec_public_processor_tx_duration_milliseconds_bucket",
      ),
    ),
    safeInstant(
      oneShotQuantile(
        0.95,
        "aztec_public_processor_tx_duration_milliseconds_bucket",
      ),
    ),
    // Pool-side pending->mined delay (now - receivedAt at the mined transition),
    // across all pool txs. Companion to the time series of the same name; lets
    // the dashboard trend it and compare against the client-observed
    // inclusionLatency* (high-value lane only).
    safeInstant(
      oneShotQuantile(0.5, "aztec_mempool_tx_mined_delay_milliseconds_bucket"),
    ),
    safeInstant(
      oneShotQuantile(0.95, "aztec_mempool_tx_mined_delay_milliseconds_bucket"),
    ),
    safeInstant(
      oneShotQuantile(0.99, "aztec_mempool_tx_mined_delay_milliseconds_bucket"),
    ),
    // Total attestation outcomes over the observed window. The node-issue count
    // is the headline reorg-diagnostic number (e.g. the run #95 "184" of failed
    // attestations); success gives a denominator for a failure ratio.
    safeInstant(
      `sum(increase(aztec_validator_attestation_failed_node_issue_count${NS}[${windowSpec}]))`,
    ),
    safeInstant(
      `sum(increase(aztec_validator_attestation_failed_bad_proposal_count${NS}[${windowSpec}]))`,
    ),
    safeInstant(
      `sum(increase(aztec_validator_attestation_success_count${NS}[${windowSpec}]))`,
    ),
  ]);

  const reorgs = a.events.filter((e) => e.type === "chainPruned");
  const deepest = reorgs.reduce((max, e) => {
    const d = (e.fromBlock ?? 0) - (e.toBlock ?? 0);
    return d > max ? d : max;
  }, 0);

  return {
    headlineKpi:
      inclusionTpsMean === null ? null : inclusionTpsMean / a.targetTps,
    targetTps: a.targetTps,
    inclusionTpsMean,
    inclusionTpsPeak,
    inclusionLatencyP50Ms: inclLatP50,
    inclusionLatencyP95Ms: inclLatP95,
    inclusionLatencyP99Ms: inclLatP99,
    blockBuildDurationP50Ms: buildP50,
    blockBuildDurationP95Ms: buildP95,
    ...blockBuildPerTx(inclusionBlocks),
    publicProcessorTxDurationP50Ms: ppTxP50,
    publicProcessorTxDurationP95Ms: ppTxP95,
    mempoolTxMinedDelayP50Ms: mempoolMinedP50,
    mempoolTxMinedDelayP95Ms: mempoolMinedP95,
    mempoolTxMinedDelayP99Ms: mempoolMinedP99,
    attestationFailedNodeIssueCount,
    attestationFailedBadProposalCount,
    attestationSuccessCount,
    totalTxsMined,
    totalTxsFailed: hasInclusionBlockRecords
      ? inclusionBlocks.reduce((s, b) => s + b.failedCount, 0)
      : null,
    totalSilentSkipCount: hasInclusionBlockRecords
      ? inclusionBlocks.reduce((s, b) => s + b.silentlySkippedCount, 0)
      : null,
    totalSilentSkipDurationMs: hasInclusionBlockRecords
      ? inclusionBlocks.reduce((s, b) => s + b.silentlySkippedDurationMs, 0)
      : null,
    reorgCount: reorgs.length,
    deepestReorgBlocks: deepest,
  };
}

// --- Inline shape validation ---

function assertShape(payload: Record<string, unknown>): void {
  const required = [
    "schemaVersion",
    "run",
    "summary",
    "timeSeries",
    "provingInfra",
    "saturation",
    "blocks",
    "events",
  ] as const;
  for (const key of required) {
    if (!(key in payload)) {
      throw new Error(`output missing required top-level key: ${key}`);
    }
  }
  if (payload.schemaVersion !== "4") {
    throw new Error(
      `schemaVersion must be "4", got ${String(payload.schemaVersion)}`,
    );
  }
  const run = payload.run as Record<string, unknown>;
  for (const key of ["runId", "startedAt", "endedAt", "namespace"] as const) {
    if (!(key in run)) {
      throw new Error(`run.${key} missing`);
    }
  }
}

// --- Live drain gate ---

async function waitForScrapeWindowEnd(args: Args, endedAtEpoch: number) {
  const minimumEndEpoch = endedAtEpoch + DRAIN_BUFFER_SECONDS;
  const invokedAtEpoch = Math.floor(Date.now() / 1000);

  if (!args.waitForPendingZero) {
    const drainSeconds = Math.max(0, minimumEndEpoch - invokedAtEpoch);
    if (drainSeconds > 0) {
      log(
        `Draining ${drainSeconds}s to let OTel batches (60s) + Prom scrape (15s) settle`,
      );
      await sleep(drainSeconds * 1000);
    }
    return {
      scrapeWindowEndEpoch: minimumEndEpoch,
      inclusionEndedAtEpoch: minimumEndEpoch,
      pendingAtEnd: null as number | null,
      pendingByRoleAtEnd: null,
      pendingTimedOut: false,
    };
  }

  if (
    !Number.isFinite(args.maxPendingWaitSeconds) ||
    args.maxPendingWaitSeconds < 0
  ) {
    throw new Error(
      `invalid --max-pending-wait-seconds: ${args.maxPendingWaitSeconds}`,
    );
  }

  const deadlineEpoch = endedAtEpoch + args.maxPendingWaitSeconds;
  const historicalZeroEpoch = await findPendingZeroEpoch(
    endedAtEpoch,
    Math.min(invokedAtEpoch, deadlineEpoch),
  );
  if (historicalZeroEpoch !== undefined) {
    const scrapeWindowEndEpoch = Math.max(
      minimumEndEpoch,
      historicalZeroEpoch + DRAIN_BUFFER_SECONDS,
    );
    const waitSeconds = Math.max(0, scrapeWindowEndEpoch - invokedAtEpoch);
    if (waitSeconds > 0) {
      log("Pending txs drained; waiting for telemetry/log settle window", {
        pendingZeroAt: historicalZeroEpoch,
        waitSeconds,
      });
      await sleep(waitSeconds * 1000);
    } else {
      log("Found historical pending-drain point; starting scrape", {
        pendingZeroAt: historicalZeroEpoch,
        scrapeWindowEndEpoch,
      });
    }
    return {
      scrapeWindowEndEpoch,
      inclusionEndedAtEpoch: historicalZeroEpoch,
      pendingAtEnd: 0,
      pendingByRoleAtEnd: await readPendingByRole(scrapeWindowEndEpoch),
      pendingTimedOut: false,
    };
  }

  let lastPending: number | null = null;
  let pendingZeroSinceEpoch: number | undefined;

  while (Math.floor(Date.now() / 1000) <= deadlineEpoch) {
    const nowEpoch = Math.floor(Date.now() / 1000);
    try {
      lastPending = await queryInstant(PENDING_VALIDATOR_TXS_QUERY, nowEpoch);
      const pending = lastPending;
      pendingZeroSinceEpoch =
        pending !== null && pending <= 0
          ? (pendingZeroSinceEpoch ?? nowEpoch)
          : undefined;
      const zeroSettleEndEpoch =
        pendingZeroSinceEpoch === undefined
          ? undefined
          : pendingZeroSinceEpoch + DRAIN_BUFFER_SECONDS;
      const scrapeReadyEpoch = Math.max(
        minimumEndEpoch,
        zeroSettleEndEpoch ?? Number.POSITIVE_INFINITY,
      );
      const settleRemainingSeconds = Math.max(
        0,
        Number.isFinite(scrapeReadyEpoch) ? scrapeReadyEpoch - nowEpoch : 0,
      );
      if (pending !== null && pending <= 0 && settleRemainingSeconds === 0) {
        const pendingByRoleAtEnd = await readPendingByRole(scrapeReadyEpoch);
        log("Validator pending txs drained; starting scrape", {
          pending,
          pendingByRoleAtEnd,
        });
        return {
          scrapeWindowEndEpoch: scrapeReadyEpoch,
          inclusionEndedAtEpoch: pendingZeroSinceEpoch ?? nowEpoch,
          pendingAtEnd: pending,
          pendingByRoleAtEnd,
          pendingTimedOut: false,
        };
      }
      log("Waiting for validator pending txs to drain before scrape", {
        validatorPending: pending,
        pendingZeroSinceEpoch,
        settleRemainingSeconds,
        timeoutRemainingSeconds: Math.max(0, deadlineEpoch - nowEpoch),
      });
    } catch (err) {
      log("pending tx drain check failed", {
        err: err instanceof Error ? err.message : String(err),
        timeoutRemainingSeconds: Math.max(0, deadlineEpoch - nowEpoch),
      });
    }
    await sleep(PENDING_POLL_SECONDS * 1000);
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  log("Timed out waiting for pending txs to drain; scraping current window", {
    validatorPending: lastPending,
    maxPendingWaitSeconds: args.maxPendingWaitSeconds,
  });
  return {
    scrapeWindowEndEpoch: Math.max(nowEpoch, minimumEndEpoch),
    inclusionEndedAtEpoch: Math.max(nowEpoch, minimumEndEpoch),
    pendingAtEnd: lastPending,
    pendingByRoleAtEnd: await readPendingByRole(nowEpoch),
    pendingTimedOut: true,
  };
}

async function readPendingByRole(tEpoch: number) {
  const read = async (promql: string): Promise<number | null> => {
    try {
      return await queryInstant(promql, tEpoch);
    } catch (err) {
      log("pending-by-role instant query failed", {
        err: err instanceof Error ? err.message : String(err),
        promql,
      });
      return null;
    }
  };
  const [rpc, validator, fullNode] = await Promise.all([
    read(PENDING_RPC_TXS_QUERY),
    read(PENDING_VALIDATOR_TXS_QUERY),
    read(PENDING_FULL_NODE_TXS_QUERY),
  ]);
  return { rpc, validator, fullNode };
}

async function findPendingZeroEpoch(
  startEpoch: number,
  endEpoch: number,
): Promise<number | undefined> {
  if (endEpoch <= startEpoch) {
    return undefined;
  }
  try {
    const series = await queryRange(
      PENDING_VALIDATOR_TXS_QUERY,
      startEpoch,
      endEpoch,
      PENDING_POLL_SECONDS,
    );
    const points = series
      .flatMap((s) => s.points)
      .sort((a, b) => {
        return a.unixEpoch - b.unixEpoch;
      });
    return points.find((p) => p.value !== null && p.value <= 0)?.unixEpoch;
  } catch (err) {
    log("historical pending tx drain check failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// --- Main ---

async function main(): Promise<void> {
  const args = parseArgs();
  const startedAtEpoch = Math.floor(Date.parse(args.startedAt) / 1000);
  const endedAtEpoch = Math.floor(Date.parse(args.endedAt) / 1000);
  if (!Number.isFinite(startedAtEpoch) || !Number.isFinite(endedAtEpoch)) {
    throw new Error(
      `invalid timestamp: started=${args.startedAt}, ended=${args.endedAt}`,
    );
  }
  const windowSec = Math.max(1, endedAtEpoch - startedAtEpoch);

  log("Opening port-forward to Prometheus");
  const teardown = await portForwardProm();

  try {
    const drain = await waitForScrapeWindowEnd(args, endedAtEpoch);
    const drainEndedAt = new Date(
      drain.scrapeWindowEndEpoch * 1000,
    ).toISOString();

    // Bounded window: by default [startedAt, endedAt + drain buffer]. Live runs
    // can opt into extending the end until pending TxPool depth reaches zero.
    const promEndEpoch = drain.scrapeWindowEndEpoch;

    log("Capturing run context (image + aztec config env + pod nodes)");
    const [capturedImage, capturedAztecConfig, capturedInfrastructure] =
      await Promise.all([
        captureImage(),
        captureAztecConfig(),
        captureInfrastructure(),
      ]);
    const previousRunContext = await loadPreviousRunContext(args.output);
    const image = capturedImage ?? previousRunContext.image;
    const aztecConfig =
      Object.keys(capturedAztecConfig).length > 0
        ? capturedAztecConfig
        : (previousRunContext.aztecConfig ?? {});
    const infrastructure =
      capturedInfrastructure ?? previousRunContext.infrastructure;

    log("Scraping Prometheus time-series");
    const timeSeries = await scrapeTimeSeries(startedAtEpoch, promEndEpoch);

    // v4: proving-infra (hint-gen + queue by job_type) and per-role saturation.
    // Independent of the inclusion timeSeries scrape so a failure here cannot
    // drop inclusion data, and vice versa.
    log("Scraping proving-infra series (hint-gen + queue by job_type)");
    const provingInfra = await scrapeDefs(
      PROVING_INFRA_DEFS,
      startedAtEpoch,
      promEndEpoch,
    );
    log("Scraping per-role saturation series (ELU/CPU/memory, max + avg)");
    const saturation = await scrapeDefs(
      SATURATION_DEFS,
      startedAtEpoch,
      promEndEpoch,
    );

    log("Loading client-observed inclusion records");
    const inclusionRecords = await loadInclusionRecords(args.inclusionRecords);
    // Compute the headline inclusion-latency time series from per-tx records
    // and inject under the same slugs the dashboard reads. No Prometheus
    // dependency for these — they reflect the true client → block-visible
    // wall-clock latency for high-value txs only.
    (timeSeries as Record<string, unknown>).txMinedDelayP50 =
      buildInclusionLatencyTimeSeries(
        inclusionRecords,
        startedAtEpoch,
        promEndEpoch,
        0.5,
      );
    (timeSeries as Record<string, unknown>).txMinedDelayP95 =
      buildInclusionLatencyTimeSeries(
        inclusionRecords,
        startedAtEpoch,
        promEndEpoch,
        0.95,
      );
    (timeSeries as Record<string, unknown>).txMinedDelayP99 =
      buildInclusionLatencyTimeSeries(
        inclusionRecords,
        startedAtEpoch,
        promEndEpoch,
        0.99,
      );

    log("Scraping per-block logs from gcloud");
    // Extend the log window by the drain buffer too — some blocks near endedAt
    // arrive in gcloud after the test stops sending.
    const logEndedAt = drainEndedAt;
    let blocks: BlockRecord[] = [];
    try {
      blocks = await scrapeBlocks(args.startedAt, logEndedAt);
      log(`Collected ${blocks.length} block records`);
    } catch (err) {
      log("blocks scrape failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log("Scraping event logs from gcloud");
    let events: Event[] = [];
    try {
      events = await scrapeEvents(args.startedAt, logEndedAt, blocks);
      log(`Collected ${events.length} events`);
    } catch (err) {
      log("events scrape failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log("Scraping sequencer state transition logs from gcloud");
    let sequencerStateSlots: SequencerStateSlot[] = [];
    try {
      sequencerStateSlots = await scrapeSequencerStateSlots(
        args.startedAt,
        logEndedAt,
      );
      log(`Collected ${sequencerStateSlots.length} sequencer state slots`);
    } catch (err) {
      log("sequencer state scrape failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }

    log("Building summary");
    const observedWindowSec = Math.max(
      1,
      drain.inclusionEndedAtEpoch - startedAtEpoch,
    );
    const summary = await buildSummary({
      targetTps: args.targetTps,
      startedAtEpoch,
      inclusionEndedAtEpoch: drain.inclusionEndedAtEpoch,
      windowSec: observedWindowSec,
      histogramWindowSec: observedWindowSec,
      endedAtEpoch: drain.inclusionEndedAtEpoch,
      timeSeries: timeSeries as Record<string, { series: SeriesEntry[] }>,
      blocks,
      events,
      inclusionRecords,
    });

    const payload = {
      schemaVersion: "4",
      run: {
        runId: args.runId,
        startedAt: args.startedAt,
        endedAt: args.endedAt,
        inclusionEndedAt: new Date(
          drain.inclusionEndedAtEpoch * 1000,
        ).toISOString(),
        drainEndedAt,
        namespace: NAMESPACE,
        gcpProject: GCP_PROJECT_ID,
        gcpLocation: GCP_REGION,
        gkeCluster: GKE_CLUSTER,
        ...(image !== undefined && { image }),
        targetTps: args.targetTps,
        ...(args.sweepId !== undefined && { sweepId: args.sweepId }),
        ...(args.sweepLabel !== undefined && { sweepLabel: args.sweepLabel }),
        testDurationSeconds: windowSec,
        workload: args.workload,
        ...(Object.keys(aztecConfig).length > 0 && { aztecConfig }),
        ...(infrastructure !== undefined && { infrastructure }),
        scrapeConfig: {
          drainSeconds: Math.max(0, drain.scrapeWindowEndEpoch - endedAtEpoch),
          stepSeconds: STEP_SECONDS,
          promUrl: `http://localhost:${PROM_PORT}`,
          waitForPendingZero: args.waitForPendingZero,
          maxPendingWaitSeconds: args.maxPendingWaitSeconds,
          pendingAtScrape: drain.pendingAtEnd,
          pendingByRoleAtScrape: drain.pendingByRoleAtEnd,
          pendingWaitTimedOut: drain.pendingTimedOut,
        },
      },
      summary,
      timeSeries,
      provingInfra,
      saturation,
      blocks,
      events,
      sequencerStateSlots,
    };

    assertShape(payload);

    const outPath = args.output ?? `/tmp/bench-10tps-${args.runId}.json`;
    await writeFile(outPath, JSON.stringify(payload, null, 2));
    // stdout: single line, consumed by the shell wrapper.
    console.log(outPath);
  } finally {
    teardown();
  }
}

main().catch((err) => {
  stderr.write(
    `[scrape] fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  exit(1);
});
