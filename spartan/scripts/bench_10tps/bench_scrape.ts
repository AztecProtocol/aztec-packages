#!/usr/bin/env -S node --experimental-strip-types --no-warnings
//
// Scrape a completed bench-10tps run into a schema-conformant JSON payload.
// Contract: bench_output.schema.json (v3). Invoked by the bench_10tps function
// in spartan/bootstrap.sh after n_tps.test.ts finishes.
//
// Two independent scrape paths so one failing does not abort the other:
//   1. Prometheus (port-forward to the cluster-shared metrics-prometheus-server)
//   2. gcloud logging read (per-block and discrete-event records)
//
// Usage:
//   ./bench_scrape.ts \
//     --run-id <id> --started <iso> --ended <iso> \
//     --target-tps 10 --workload sha256_hash_1024

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { argv, env, exit, stderr } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

// --- Config ---

const NAMESPACE = env.NAMESPACE ?? "bench-10tps";
// Prometheus is cluster-shared in the "metrics" namespace, not per-environment.
const PROM_NS = env.PROM_NS ?? "metrics";
const PROM_SERVICE = env.PROM_SERVICE ?? "metrics-prometheus-server";
const PROM_PORT = Number(env.PROM_PORT ?? 9090);
const STEP_SECONDS = 15;
const DRAIN_BUFFER_SECONDS = 90; // OTel batch push 60s + one Prom scrape 15s + slack

// --- CLI ---

type Args = {
  runId: string;
  startedAt: string;
  endedAt: string;
  targetTps: number;
  workload: string;
  output: string | undefined;
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
const histQuantile = (q: number, bucket: string, groupBy: string[] = []) => {
  const groupKeys = ["le", ...groupBy].join(", ");
  return `histogram_quantile(${q}, sum by (${groupKeys})(rate(${bucket}${NS}[1m])))`;
};

type TimeSeriesDef = { metric: string; unit: string; query: string };

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
  // Mempool size sliced by pod role. Three single-series slugs make cross-run
  // overlay clean: pod names are unstable (replica counts and restart suffixes
  // change between runs) but role is stable. Each query filters to TxPool to
  // avoid mixing in the AttestationPool counters that share the metric name.
  // max() over a role collapses the per-pod fan-out — for an under-fill
  // investigation we care about the role's deepest backlog at any moment.
  mempoolSizeRpc: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",k8s_pod_name=~"${NAMESPACE}-rpc.*"})`,
  },
  mempoolSizeValidator: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",k8s_pod_name=~"${NAMESPACE}-validator.*"})`,
  },
  mempoolSizeFullNode: {
    metric: "aztec_mempool_tx_count",
    unit: "count",
    query: `max(aztec_mempool_tx_count{k8s_namespace_name="${NAMESPACE}",aztec_pool_name="TxPool",k8s_pod_name=~"${NAMESPACE}-full-node.*"})`,
  },
  mempoolEvictedByReasonRate: {
    metric: "aztec_mempool_tx_pool_v2_evicted_count",
    unit: "tps",
    query: `sum by (rejection_reason)(rate(aztec_mempool_tx_pool_v2_evicted_count${NS}[1m]))`,
  },
  mempoolRejectedByReasonRate: {
    metric: "aztec_mempool_tx_pool_v2_rejected_count",
    unit: "tps",
    query: `sum by (rejection_reason)(rate(aztec_mempool_tx_pool_v2_rejected_count${NS}[1m]))`,
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
    metric: "aztec_public_processor_total_gas",
    unit: "mana/s",
    // Every pod that processes public calls emits this counter for the same
    // blocks — avg() collapses to per-block rate (same reasoning as inclusionTps).
    query: `avg(rate(aztec_public_processor_total_gas${NS}[1m]))`,
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
  // archiver exports this as _seconds (not _milliseconds) — convert to ms for
  // consistency with the schema's p95Ms summary keys.
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
  peerCountMean: {
    metric: "aztec_peer_manager_peer_count_peers",
    unit: "count",
    query: `avg(aztec_peer_manager_peer_count_peers${NS})`,
  },
  attestationsCollectDurationP95: {
    metric: "aztec_sequencer_attestations_collect_duration_milliseconds",
    unit: "ms",
    query: histQuantile(
      0.95,
      "aztec_sequencer_attestations_collect_duration_milliseconds_bucket",
    ),
  },
  attestationsCollectAllowanceMean: {
    metric: "aztec_sequencer_attestations_collect_allowance_milliseconds",
    unit: "ms",
    query: `avg(aztec_sequencer_attestations_collect_allowance_milliseconds${NS})`,
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
  // tx_collector signals: the proposer's view of where its txs came from.
  // from_p2p / (from_p2p + from_mempool) ratio answers "did the proposer have
  // to network-fetch?", which is the gossip-propagation hypothesis.
  txCollectorTxsFromMempoolRate: {
    metric: "aztec_tx_collector_txs_from_mempool_count",
    unit: "tps",
    query: `sum(rate(aztec_tx_collector_txs_from_mempool_count${NS}[1m]))`,
  },
  txCollectorTxsFromP2pRate: {
    metric: "aztec_tx_collector_txs_from_p2p_count",
    unit: "tps",
    query: `sum(rate(aztec_tx_collector_txs_from_p2p_count${NS}[1m]))`,
  },
  txCollectorMissingRate: {
    metric: "aztec_tx_collector_missing_txs_count",
    unit: "tps",
    query: `sum(rate(aztec_tx_collector_missing_txs_count${NS}[1m]))`,
  },
  txCollectorRequestedFractionMean: {
    metric: "aztec_tx_collector_txs_requested_fraction",
    unit: "fraction",
    query: `avg(aztec_tx_collector_txs_requested_fraction${NS})`,
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
      ["sequencer_state"],
    ),
  },
};

async function scrapeTimeSeries(
  startedAtEpoch: number,
  endedAtEpoch: number,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [slug, def] of Object.entries(TIME_SERIES_DEFS)) {
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
      log(`timeSeries.${slug} scrape failed, emitting empty series`, {
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
        "--format=json",
        "--order=asc",
        "--freshness=24h",
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

// Curated subset of env vars worth recording per run so the dashboard can
// show e.g. "pool=20k vs pool=1000" alongside two compared runs. Anything not
// in this list is excluded — full env would be huge and mostly uninteresting.
const AZTEC_CONFIG_KEYS = [
  "SEQ_MAX_TX_PER_BLOCK",
  "SEQ_MAX_TX_PER_CHECKPOINT",
  "SEQ_L1_PUBLISHING_TIME_ALLOWANCE_IN_SLOT",
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
  const filter = [
    `resource.labels.namespace_name="${NAMESPACE}"`,
    `resource.labels.pod_name=~"${NAMESPACE}-(validator|rpc).*"`,
    `jsonPayload.message=~"^Processed [0-9]+ successful txs and"`,
    timeFilter(startedAt, endedAt),
  ].join(" AND ");
  const entries = await gcloudRead(filter);

  // Each block is logged once per pod that processed it (validators +
  // RPC-colocated full node sync). Dedupe by blockNumber, keep the earliest
  // timestamp — that's most likely the proposer who built the block.
  const byBlock = new Map<number, { entry: GcloudEntry; time: number }>();
  for (const entry of entries) {
    const p = entry.jsonPayload;
    if (!p) {
      continue;
    }
    const blockNumber =
      typeof p.blockNumber === "number"
        ? p.blockNumber
        : typeof p.blockNumber === "string"
          ? Number(p.blockNumber)
          : NaN;
    if (!Number.isFinite(blockNumber)) {
      continue;
    }
    const t = Date.parse(entry.timestamp);
    const prev = byBlock.get(blockNumber);
    if (!prev || t < prev.time) {
      byBlock.set(blockNumber, { entry, time: t });
    }
  }

  if (byBlock.size === 0) {
    return [];
  }
  const blockNumbers = [...byBlock.keys()].sort((a, b) => a - b);
  const first = blockNumbers[0];

  return blockNumbers.map((bn) => {
    const { entry } = byBlock.get(bn)!;
    const p = entry.jsonPayload!;
    return {
      blockNumber: bn,
      blockNumberInTest: bn - first,
      minedAt: entry.timestamp,
      successfulCount: Number(p.successfulCount ?? 0),
      failedCount: Number(p.failedCount ?? 0),
      silentlySkippedCount: Number(p.silentlySkippedCount ?? 0),
      silentlySkippedDurationMs: Number(p.silentlySkippedDurationMs ?? 0),
      buildDurationSeconds: Number(p.duration ?? 0),
      totalPublicGas: p.totalPublicGas as
        | { daGas: number; l2Gas: number }
        | undefined,
      totalSizeInBytes:
        typeof p.totalSizeInBytes === "number" ? p.totalSizeInBytes : undefined,
      source: "log",
    };
  });
}

type Event = {
  at: string;
  type: "chainPruned";
  source: "log";
  fromBlock?: number;
  toBlock?: number;
};

const CHAIN_PRUNED_MSG = /Chain pruned to block (\d+)/;

async function scrapeEvents(
  startedAt: string,
  endedAt: string,
  blocks: BlockRecord[],
): Promise<Event[]> {
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
  windowSec: number;
  endedAtEpoch: number;
  timeSeries: Record<string, { series: SeriesEntry[] }>;
  blocks: BlockRecord[];
  events: Event[];
};

async function buildSummary(a: SummaryArgs): Promise<Record<string, unknown>> {
  // inclusionTps is single-series; series[0] holds all points.
  const inclusionPoints = a.timeSeries.inclusionTps?.series?.[0]?.points ?? [];
  const inclusionTpsMean = meanNonNull(inclusionPoints);
  const inclusionTpsPeak = maxNonNull(inclusionPoints);

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

  const windowSpec = `${a.windowSec}s`;
  const oneShotQuantile = (q: number, bucket: string) =>
    `histogram_quantile(${q}, sum by (le)(rate(${bucket}${NS}[${windowSpec}])))`;

  const [
    inclLatP50,
    inclLatP95,
    inclLatP99,
    buildP50,
    buildP95,
    ppTxP50,
    ppTxP95,
  ] = await Promise.all([
    safeInstant(
      oneShotQuantile(0.5, "aztec_mempool_tx_mined_delay_milliseconds_bucket"),
    ),
    safeInstant(
      oneShotQuantile(0.95, "aztec_mempool_tx_mined_delay_milliseconds_bucket"),
    ),
    safeInstant(
      oneShotQuantile(0.99, "aztec_mempool_tx_mined_delay_milliseconds_bucket"),
    ),
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
    publicProcessorTxDurationP50Ms: ppTxP50,
    publicProcessorTxDurationP95Ms: ppTxP95,
    totalTxsMined: a.blocks.reduce((s, b) => s + b.successfulCount, 0),
    totalTxsFailed: a.blocks.reduce((s, b) => s + b.failedCount, 0),
    totalSilentSkipCount: a.blocks.reduce(
      (s, b) => s + b.silentlySkippedCount,
      0,
    ),
    totalSilentSkipDurationMs: a.blocks.reduce(
      (s, b) => s + b.silentlySkippedDurationMs,
      0,
    ),
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
    "blocks",
    "events",
  ] as const;
  for (const key of required) {
    if (!(key in payload)) {
      throw new Error(`output missing required top-level key: ${key}`);
    }
  }
  if (payload.schemaVersion !== "3") {
    throw new Error(
      `schemaVersion must be "3", got ${String(payload.schemaVersion)}`,
    );
  }
  const run = payload.run as Record<string, unknown>;
  for (const key of ["runId", "startedAt", "endedAt", "namespace"] as const) {
    if (!(key in run)) {
      throw new Error(`run.${key} missing`);
    }
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

  const now = Math.floor(Date.now() / 1000);
  const drainSeconds = Math.max(0, endedAtEpoch + DRAIN_BUFFER_SECONDS - now);
  if (drainSeconds > 0) {
    log(
      `Draining ${drainSeconds}s to let OTel batches (60s) + Prom scrape (15s) settle`,
    );
    await sleep(drainSeconds * 1000);
  }
  const drainEndedAt = new Date().toISOString();

  log("Opening port-forward to Prometheus");
  const teardown = await portForwardProm();

  try {
    // Bounded window: always [startedAt, endedAt + drain buffer]. Using wall-clock
    // "now" here would over-extend when the scraper is replaying a historical
    // window (drainSeconds clamped to 0), pulling in unrelated data.
    const promEndEpoch = endedAtEpoch + DRAIN_BUFFER_SECONDS;

    log("Capturing run context (image + aztec config env)");
    const [image, aztecConfig] = await Promise.all([
      captureImage(),
      captureAztecConfig(),
    ]);

    log("Scraping Prometheus time-series");
    const timeSeries = await scrapeTimeSeries(startedAtEpoch, promEndEpoch);

    log("Scraping per-block logs from gcloud");
    // Extend the log window by the drain buffer too — some blocks near endedAt
    // arrive in gcloud after the test stops sending.
    const logEndedAt = new Date(
      (endedAtEpoch + DRAIN_BUFFER_SECONDS) * 1000,
    ).toISOString();
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

    log("Building summary");
    const summary = await buildSummary({
      targetTps: args.targetTps,
      windowSec,
      endedAtEpoch,
      timeSeries: timeSeries as Record<string, { series: SeriesEntry[] }>,
      blocks,
      events,
    });

    const payload = {
      schemaVersion: "3",
      run: {
        runId: args.runId,
        startedAt: args.startedAt,
        endedAt: args.endedAt,
        drainEndedAt,
        namespace: NAMESPACE,
        ...(image !== undefined && { image }),
        targetTps: args.targetTps,
        testDurationSeconds: windowSec,
        workload: args.workload,
        ...(Object.keys(aztecConfig).length > 0 && { aztecConfig }),
        scrapeConfig: {
          drainSeconds,
          stepSeconds: STEP_SECONDS,
          promUrl: `http://localhost:${PROM_PORT}`,
        },
      },
      summary,
      timeSeries,
      blocks,
      events,
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
