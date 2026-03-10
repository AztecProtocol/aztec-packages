#!/usr/bin/env -S node --experimental-strip-types --no-warnings
/**
 * Extract proving metrics from GCP Cloud Logging for a prover node.
 *
 * Usage:
 *   ./extract_proving_metrics.ts <namespace> --start <ISO8601> [--end <ISO8601>] [--epoch <number>] [--project <id>] [--pod <name>]
 *
 * Examples:
 *   # Auto-detect first epoch with >=1 tx after the given start time:
 *   ./extract_proving_metrics.ts prove-n-tps-real --start 2026-03-01T19:00:00Z
 *
 *   # Specify epoch number:
 *   ./extract_proving_metrics.ts prove-n-tps-real --start 2026-03-01T19:00:00Z --epoch 3
 *
 *   # Explicit time range (no auto-detection):
 *   ./extract_proving_metrics.ts prove-n-tps-real --start 2026-03-01T19:58:00Z --end 2026-03-01T20:25:00Z
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ── CLI arg parsing ──────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  namespace: string;
  start: string;
  end: string;
  epoch: number | undefined;
  project: string;
  pod: string;
} {
  const args = argv.slice(2);
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        flags[key] = args[++i];
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(args[i]);
    }
  }

  const namespace = positional[0];
  if (!namespace) {
    console.error(
      "Usage: extract_proving_metrics.ts <namespace> --start <ISO8601> [--end <ISO8601>] [--epoch <number>] [--project <id>] [--pod <name>]",
    );
    process.exit(1);
  }
  if (!flags.start) {
    console.error("Error: --start is required (ISO 8601 timestamp)");
    process.exit(1);
  }

  // Default end: now
  const defaultEnd = new Date().toISOString();

  return {
    namespace,
    start: flags.start,
    end: flags.end || defaultEnd,
    epoch: flags.epoch !== undefined ? parseInt(flags.epoch) : undefined,
    project: flags.project || "testnet-440309",
    pod: flags.pod || `${namespace}-prover-node-0`,
  };
}

const config = parseArgs(process.argv);

// ── GCP log query helpers ────────────────────────────────────────────────────

interface LogEntry {
  timestamp: string;
  trace?: string;
  jsonPayload?: {
    message?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

function buildFilter(
  textFilter: string,
  opts?: { module?: string; pod?: string; trace?: string },
): string {
  const pod = opts?.pod ?? config.pod;
  let filter =
    `resource.type="k8s_container"` +
    ` AND resource.labels.namespace_name="${config.namespace}"` +
    ` AND resource.labels.pod_name="${pod}"` +
    ` AND timestamp>="${config.start}"` +
    ` AND timestamp<="${config.end}"` +
    ` AND jsonPayload.message=~"${textFilter}"`;
  if (opts?.module) {
    filter += ` AND jsonPayload.module="${opts.module}"`;
  }
  if (opts?.trace) {
    filter += ` AND trace="${opts.trace}"`;
  }
  return filter;
}

async function queryLogs(
  name: string,
  textFilter: string,
  opts?: { module?: string; pod?: string; trace?: string },
): Promise<LogEntry[]> {
  const filter = buildFilter(textFilter, opts);
  const cmd = [
    "gcloud",
    "logging",
    "read",
    JSON.stringify(filter),
    `--project=${config.project}`,
    "--format=json",
    `--freshness=7d`,
  ].join(" ");

  process.stderr.write(`  Querying: ${name}...\n`);
  try {
    const { stdout } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
    const entries: LogEntry[] = JSON.parse(stdout || "[]");
    process.stderr.write(`  ${name}: ${entries.length} entries\n`);
    return entries;
  } catch (err: any) {
    process.stderr.write(`  ${name}: ERROR - ${err.message?.split("\n")[0]}\n`);
    return [];
  }
}

// ── Epoch auto-detection ─────────────────────────────────────────────────────

async function scanForEpoch(): Promise<{ start: string; end: string; trace?: string }> {
  process.stderr.write(
    `Scanning for epoch in ${config.start} to ${config.end}...\n\n`,
  );

  const [epochStarts, epochFinalized] = await Promise.all([
    queryLogs("scan-epoch-starts", "Starting epoch.*proving job"),
    queryLogs("scan-epoch-finalized", "Finalized proof for epoch"),
  ]);

  process.stderr.write("\n");

  // Parse all epoch start entries
  const starts: {
    epoch: number;
    txCount: number;
    timestamp: string;
    trace?: string;
  }[] = [];
  for (const entry of epochStarts) {
    const m = msg(entry);
    const p = entry.jsonPayload || {};
    const epochMatch = m.match(
      /Starting epoch (\d+).*checkpoints (\d+) to (\d+)/,
    );
    if (epochMatch) {
      starts.push({
        epoch: parseInt(epochMatch[1]),
        txCount: p.epochSizeTxs ?? 0,
        timestamp: entry.timestamp,
        trace: entry.trace,
      });
    }
  }

  // Sort by timestamp ascending
  starts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Pick target epoch
  let target: (typeof starts)[0] | undefined;
  if (config.epoch !== undefined) {
    target = starts.find((s) => s.epoch === config.epoch);
    if (!target) {
      process.stderr.write(
        `Warning: epoch ${config.epoch} not found in scan window. Using full window.\n`,
      );
      return { start: config.start, end: config.end, trace: undefined };
    }
  } else {
    target = starts.find((s) => s.txCount >= 1);
    if (!target) {
      process.stderr.write(
        `Warning: no epoch with >=1 tx found in scan window. Using full window.\n`,
      );
      return { start: config.start, end: config.end, trace: undefined };
    }
  }

  process.stderr.write(
    `Found epoch ${target.epoch} (${target.txCount} txs) at ${target.timestamp}${target.trace ? ` trace=${target.trace}` : ""}\n`,
  );

  // Find matching finalized entry
  const finalized = epochFinalized.find((entry) => {
    const m = msg(entry);
    const match = m.match(/Finalized proof for epoch (\d+)/);
    return match && parseInt(match[1]) === target.epoch;
  });

  // Epoch start timestamp minus a few seconds to capture all leading logs
  const narrowedStart = new Date(
    new Date(target.timestamp).getTime() - 5000,
  ).toISOString();

  let narrowedEnd: string;
  if (finalized) {
    // Pad 60s after finalized to capture trailing logs
    narrowedEnd = new Date(
      new Date(finalized.timestamp).getTime() + 60000,
    ).toISOString();
    process.stderr.write(
      `Epoch ${target.epoch} finalized at ${finalized.timestamp}\n`,
    );
  } else {
    narrowedEnd = config.end;
    process.stderr.write(
      `Epoch ${target.epoch} finalized entry not found, using scan window end.\n`,
    );
  }

  process.stderr.write(
    `Narrowed window: ${narrowedStart} to ${narrowedEnd}\n\n`,
  );

  return { start: narrowedStart, end: narrowedEnd, trace: target.trace };
}

// ── Pipeline order for proving job types ─────────────────────────────────────

const PIPELINE_ORDER = [
  "PARITY_BASE",
  "PARITY_ROOT",
  "PUBLIC_CHONK_VERIFIER",
  "PUBLIC_VM",
  "PUBLIC_TX_BASE_ROLLUP",
  "TX_MERGE_ROLLUP",
  "BLOCK_ROOT_ROLLUP",
  "BLOCK_ROOT_FIRST_ROLLUP",
  "BLOCK_ROOT_SINGLE_TX_ROLLUP",
  "BLOCK_MERGE_ROLLUP",
  "CHECKPOINT_ROOT_ROLLUP",
  "CHECKPOINT_MERGE_ROLLUP",
  "ROOT_ROLLUP",
];

// ── Query definitions ────────────────────────────────────────────────────────

async function fetchAllData(trace?: string) {
  process.stderr.write(
    `Fetching logs for ${config.pod} in ${config.namespace}\n`,
  );
  process.stderr.write(`Time range: ${config.start} to ${config.end}\n`);
  if (trace) {
    process.stderr.write(`Trace filter: ${trace}\n`);
  }
  process.stderr.write("\n");

  const brokerPod = `${config.namespace}-prover-broker-0`;

  const [
    epochStart,
    blobFields,
    blobBatching,
    startingBlock,
    processedTxs,
    addingTxs,
    epochFinalized,
    brokerNewJobs,
    brokerCompleteJobs,
  ] = await Promise.all([
    queryLogs("epoch-start", "Starting epoch.*proving job", { trace }),
    queryLogs("blob-fields", "Blob fields per checkpoint", { trace }),
    queryLogs("blob-batching", "Final blob batching", { trace }),
    queryLogs("starting-block", "Starting block", {
      module: "prover-client:orchestrator",
      trace,
    }),
    queryLogs("processed-txs", "Processed.*successful txs", { trace }),
    queryLogs("adding-txs", "Adding.*transactions to block", { trace }),
    queryLogs("epoch-finalized", "Finalized proof for epoch", { trace }),
    queryLogs("broker-new-jobs", "New proving job", { pod: brokerPod }),
    queryLogs("broker-complete-jobs", "Proving job complete", {
      pod: brokerPod,
    }),
  ]);

  process.stderr.write("\n");
  return {
    epochStart,
    blobFields,
    blobBatching,
    startingBlock,
    processedTxs,
    addingTxs,
    epochFinalized,
    brokerNewJobs,
    brokerCompleteJobs,
  };
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function formatDelta(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m ${seconds}s`;
}

function minTimestamp(entries: LogEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries.reduce(
    (min, e) => (e.timestamp < min ? e.timestamp : min),
    entries[0].timestamp,
  );
}

function maxTimestamp(entries: LogEntry[]): string | null {
  if (entries.length === 0) return null;
  return entries.reduce(
    (max, e) => (e.timestamp > max ? e.timestamp : max),
    entries[0].timestamp,
  );
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

function msg(entry: LogEntry): string {
  return entry.jsonPayload?.message || "";
}

function parseEpochStart(entries: LogEntry[]): {
  epoch: number;
  fromCheckpoint: number;
  toCheckpoint: number;
  fromBlock: number;
  toBlock: number;
  txCount: number;
} | null {
  if (entries.length === 0) return null;
  const entry = entries[0];
  const m = msg(entry);
  const p = entry.jsonPayload || {};
  // Message: "Starting epoch 3 proving job with checkpoints 33 to 64"
  // Structured fields: epochNumber, fromBlock, toBlock, epochSizeTxs
  const epochMatch = m.match(
    /Starting epoch (\d+).*checkpoints (\d+) to (\d+)/,
  );
  if (!epochMatch) return null;
  return {
    epoch: parseInt(epochMatch[1]),
    fromCheckpoint: parseInt(epochMatch[2]),
    toCheckpoint: parseInt(epochMatch[3]),
    fromBlock: p.fromBlock ?? 0,
    toBlock: p.toBlock ?? 0,
    txCount: p.epochSizeTxs ?? 0,
  };
}

function parseBlobFields(entries: LogEntry[]): string | null {
  if (entries.length === 0) return null;
  const m = msg(entries[0]);
  // "Blob fields per checkpoint: 211.92427600175142ms"
  const match = m.match(/Blob fields per checkpoint:\s*([\d.]+)ms/);
  return match ? `${parseFloat(match[1]).toFixed(2)}ms` : null;
}

function parseBlobBatching(entries: LogEntry[]): string | null {
  if (entries.length === 0) return null;
  const m = msg(entries[0]);
  // "Final blob batching challeneger: 3408.9118730016053ms" (note typo in source)
  const match = m.match(/Final blob batching.*?:\s*([\d.]+)ms/);
  return match ? `${parseFloat(match[1]).toFixed(2)}ms` : null;
}

interface BlockInfo {
  blockNumber: number;
  slot: number;
  txCount: number;
  processingTime: number; // seconds
}

function parseStartingBlocks(
  entries: LogEntry[],
): Map<number, { blockNumber: number; slot: number }> {
  // "Starting block 175 for slot 112."
  const result = new Map<number, { blockNumber: number; slot: number }>();
  for (const entry of entries) {
    const m2 = msg(entry);
    const match = m2.match(/Starting block (\d+) for slot (\d+)/);
    if (match) {
      const blockNumber = parseInt(match[1]);
      const slot = parseInt(match[2]);
      result.set(blockNumber, { blockNumber, slot });
    }
  }
  return result;
}

function parseProcessedTxs(
  entries: LogEntry[],
): { timestamp: string; txCount: number; duration: number }[] {
  // "Processed 18 successful txs and 0 failed txs in 29.2s"
  const results: { timestamp: string; txCount: number; duration: number }[] =
    [];
  for (const entry of entries) {
    const m2 = msg(entry);
    const match = m2.match(/Processed (\d+) successful txs.*?in ([\d.]+)s/);
    if (match) {
      results.push({
        timestamp: entry.timestamp,
        txCount: parseInt(match[1]),
        duration: parseFloat(match[2]),
      });
    }
  }
  return results;
}

function parseAddingTxs(
  entries: LogEntry[],
): { timestamp: string; txCount: number; blockNumber: number }[] {
  // "Adding 6 transactions to block 175"
  const results: { timestamp: string; txCount: number; blockNumber: number }[] =
    [];
  for (const entry of entries) {
    const m2 = msg(entry);
    const match = m2.match(/Adding (\d+) transactions to block (\d+)/);
    if (match) {
      results.push({
        timestamp: entry.timestamp,
        txCount: parseInt(match[1]),
        blockNumber: parseInt(match[2]),
      });
    }
  }
  return results;
}

function parseEpochFinalized(entries: LogEntry[]): { duration: string } | null {
  if (entries.length === 0) return null;
  const p = entries[0].jsonPayload || {};
  // Duration is in jsonPayload.duration (milliseconds)
  const durationMs = p.duration;
  if (durationMs == null) return null;
  const totalSeconds = durationMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return { duration: `${minutes}m ${seconds}s` };
}

// ── Broker job parsing ───────────────────────────────────────────────────────

interface BrokerJobStage {
  enqueuedFirst: number;
  enqueuedLast: number;
  completedFirst: number;
  completedLast: number;
  count: number;
  completedCount: number;
}

interface BrokerJobDuration {
  type: string;
  durationMs: number;
}

function parseBrokerJobs(
  newEntries: LogEntry[],
  completeEntries: LogEntry[],
): { stages: Map<string, BrokerJobStage>; durations: BrokerJobDuration[] } {
  // Index "new" entries by provingJobId for duration matching
  const newById = new Map<string, { type: string; timestamp: number }>();

  // Aggregate per-type timestamps
  const stages = new Map<string, BrokerJobStage>();

  for (const entry of newEntries) {
    const m2 = msg(entry);
    const typeMatch = m2.match(/id=\d+:(\w+):/);
    if (!typeMatch) continue;
    const type = typeMatch[1];
    const ts = new Date(entry.timestamp).getTime();
    const jobId = entry.jsonPayload?.provingJobId;
    if (jobId) {
      newById.set(jobId, { type, timestamp: ts });
    }

    const existing = stages.get(type);
    if (existing) {
      existing.enqueuedFirst = Math.min(existing.enqueuedFirst, ts);
      existing.enqueuedLast = Math.max(existing.enqueuedLast, ts);
      existing.count++;
    } else {
      stages.set(type, {
        enqueuedFirst: ts,
        enqueuedLast: ts,
        completedFirst: Infinity,
        completedLast: -Infinity,
        count: 1,
        completedCount: 0,
      });
    }
  }

  const durations: BrokerJobDuration[] = [];

  for (const entry of completeEntries) {
    const m2 = msg(entry);
    const typeMatch = m2.match(/type=(\w+)/);
    if (!typeMatch) continue;
    const type = typeMatch[1];
    const ts = new Date(entry.timestamp).getTime();

    const existing = stages.get(type);
    if (existing) {
      existing.completedFirst = Math.min(existing.completedFirst, ts);
      existing.completedLast = Math.max(existing.completedLast, ts);
      existing.completedCount++;
    } else {
      stages.set(type, {
        enqueuedFirst: Infinity,
        enqueuedLast: -Infinity,
        completedFirst: ts,
        completedLast: ts,
        count: 0,
        completedCount: 1,
      });
    }

    // Match with new entry for per-job duration
    const jobId = entry.jsonPayload?.provingJobId;
    if (jobId) {
      const newEntry = newById.get(jobId);
      if (newEntry) {
        durations.push({ type, durationMs: ts - newEntry.timestamp });
      }
    }
  }

  return { stages, durations };
}

function computeDurationStats(
  durations: BrokerJobDuration[],
): Map<
  string,
  { count: number; median: number; mean: number; p90: number; max: number }
> {
  // Group by type
  const byType = new Map<string, number[]>();
  for (const d of durations) {
    const arr = byType.get(d.type);
    if (arr) {
      arr.push(d.durationMs);
    } else {
      byType.set(d.type, [d.durationMs]);
    }
  }

  const stats = new Map<
    string,
    { count: number; median: number; mean: number; p90: number; max: number }
  >();
  for (const [type, values] of byType) {
    values.sort((a, b) => a - b);
    const count = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / count;
    const median =
      count % 2 === 0
        ? (values[count / 2 - 1] + values[count / 2]) / 2
        : values[Math.floor(count / 2)];
    const p90Index = Math.min(Math.ceil(count * 0.9) - 1, count - 1);
    const p90 = values[p90Index];
    const max = values[count - 1];
    stats.set(type, { count, median, mean, p90, max });
  }

  return stats;
}

function sortedJobTypes(stages: Map<string, BrokerJobStage>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  // First add types in pipeline order
  for (const type of PIPELINE_ORDER) {
    if (stages.has(type)) {
      ordered.push(type);
      seen.add(type);
    }
  }

  // Then append any remaining types sorted by first enqueue time
  const remaining = [...stages.entries()]
    .filter(([type]) => !seen.has(type))
    .sort((a, b) => a[1].enqueuedFirst - b[1].enqueuedFirst)
    .map(([type]) => type);

  return [...ordered, ...remaining];
}

// ── Correlate per-block data ─────────────────────────────────────────────────

function correlateBlocks(
  processedTxs: { timestamp: string; txCount: number; duration: number }[],
  addingTxs: { timestamp: string; txCount: number; blockNumber: number }[],
  startingBlocks: Map<number, { blockNumber: number; slot: number }>,
): BlockInfo[] {
  // "Processed" and "Adding" entries share identical timestamps.
  // Sort both by timestamp and zip 1:1. Slot comes from "Starting block" entries.
  const sorted_processed = [...processedTxs].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  const sorted_adding = [...addingTxs].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );

  const blocks: BlockInfo[] = [];

  if (sorted_processed.length !== sorted_adding.length) {
    process.stderr.write(
      `Warning: processed (${sorted_processed.length}) and adding (${sorted_adding.length}) entry counts differ. ` +
        `Correlating by position.\n`,
    );
  }

  const count = Math.min(sorted_processed.length, sorted_adding.length);
  for (let i = 0; i < count; i++) {
    const blockNumber = sorted_adding[i].blockNumber;
    const slotInfo = startingBlocks.get(blockNumber);
    blocks.push({
      blockNumber,
      slot: slotInfo?.slot ?? 0,
      txCount: sorted_adding[i].txCount,
      processingTime: sorted_processed[i].duration,
    });
  }

  // Sort by block number for output
  blocks.sort((a, b) => a.blockNumber - b.blockNumber);
  return blocks;
}

// ── Format output ────────────────────────────────────────────────────────────

function formatOutput(data: Awaited<ReturnType<typeof fetchAllData>>): string {
  const lines: string[] = [];

  const epochInfo = parseEpochStart(data.epochStart);
  if (epochInfo) {
    const checkpointCount =
      epochInfo.toCheckpoint - epochInfo.fromCheckpoint + 1;
    const blockCount = epochInfo.toBlock - epochInfo.fromBlock + 1;
    lines.push(`Epoch ${epochInfo.epoch} stats:`);
    lines.push(
      `  Checkpoints: ${checkpointCount} (${epochInfo.fromCheckpoint} to ${epochInfo.toCheckpoint}), ` +
        `Blocks: ${blockCount} (${epochInfo.fromBlock} to ${epochInfo.toBlock}), ` +
        `Txs: ${epochInfo.txCount}`,
    );
  } else {
    lines.push("Epoch stats: not found");
  }

  const blobFieldsTime = parseBlobFields(data.blobFields);
  if (blobFieldsTime) {
    lines.push(`  Blob fields per checkpoint: ${blobFieldsTime}`);
  }

  const blobBatchingTime = parseBlobBatching(data.blobBatching);
  if (blobBatchingTime) {
    lines.push(`  Blob batching: ${blobBatchingTime}`);
  }

  // Timeline
  const epochStartTs = data.epochStart[0]?.timestamp;
  const blocksStartTs = minTimestamp(data.startingBlock);
  const blocksEndTs = maxTimestamp(data.processedTxs);
  const epochEndTs = data.epochFinalized[0]?.timestamp;

  const { stages, durations } = parseBrokerJobs(
    data.brokerNewJobs,
    data.brokerCompleteJobs,
  );

  if (epochStartTs) {
    const t0 = new Date(epochStartTs).getTime();

    // Build all timeline events: [timestamp_ms, label]
    const events: [number, string][] = [];
    if (epochStartTs)
      events.push([new Date(epochStartTs).getTime(), "Epoch started proving"]);
    if (blocksStartTs)
      events.push([
        new Date(blocksStartTs).getTime(),
        "Blocks started processing",
      ]);
    if (blocksEndTs)
      events.push([
        new Date(blocksEndTs).getTime(),
        "Blocks finished processing",
      ]);
    if (epochEndTs)
      events.push([new Date(epochEndTs).getTime(), "Epoch finished proving"]);

    // Add per-stage proving events
    for (const [type, s] of stages) {
      if (s.count > 0) {
        events.push([
          s.enqueuedFirst,
          `${type} first enqueued (${s.count} jobs)`,
        ]);
        if (s.count > 1) {
          events.push([s.enqueuedLast, `${type} last enqueued`]);
        }
      }
      if (s.completedCount > 0) {
        events.push([s.completedLast, `${type} last proof completed`]);
      }
    }

    // Sort chronologically (stable)
    events.sort((a, b) => a[0] - b[0]);

    const labelWidth = Math.max(...events.map(([, label]) => label.length));
    lines.push("");
    lines.push("Timeline:");
    for (const [ts, label] of events) {
      const delta = ts - t0;
      lines.push(`  ${label.padEnd(labelWidth)}  T+${formatDelta(delta)}`);
    }
  }
  if (stages.size > 0 && epochStartTs) {
    const t0 = new Date(epochStartTs).getTime();
    const types = sortedJobTypes(stages);
    const typeWidth = Math.max(...types.map((t) => t.length));
    const countWidth = Math.max(
      ...types.map((t) => String(stages.get(t)!.count).length),
    );

    lines.push("");
    lines.push("Proving jobs by stage:");
    for (const type of types) {
      const s = stages.get(type)!;
      const countStr = String(s.count).padStart(countWidth);
      const typeStr = type.padEnd(typeWidth);

      // Enqueue range
      let enqueueStr: string;
      if (s.count === 0) {
        enqueueStr = "n/a";
      } else if (s.count === 1) {
        enqueueStr = `enqueued T+${formatDelta(s.enqueuedFirst - t0)}`;
      } else {
        enqueueStr = `enqueued T+${formatDelta(s.enqueuedFirst - t0)}..T+${formatDelta(s.enqueuedLast - t0)}`;
      }

      // Complete range
      let completeStr: string;
      if (s.completedCount === 0) {
        completeStr = "not completed";
      } else if (s.completedCount === 1) {
        completeStr = `completed T+${formatDelta(s.completedFirst - t0)}`;
      } else {
        completeStr = `completed T+${formatDelta(s.completedFirst - t0)}..T+${formatDelta(s.completedLast - t0)}`;
      }

      // Wall-clock duration from first enqueue to last complete
      let wallStr = "";
      if (s.count > 0 && s.completedCount > 0) {
        wallStr = `  (${formatDelta(s.completedLast - s.enqueuedFirst)})`;
      }

      lines.push(
        `  ${typeStr}  ${countStr} jobs    ${enqueueStr.padEnd(35)}${completeStr}${wallStr}`,
      );
    }
  }

  // Per-job duration stats
  if (durations.length > 0) {
    const durationStats = computeDurationStats(durations);
    const types = sortedJobTypes(stages).filter((t) => durationStats.has(t));
    // Add any types not in stages (shouldn't happen but be safe)
    for (const t of durationStats.keys()) {
      if (!types.includes(t)) types.push(t);
    }

    if (types.length > 0) {
      const typeWidth = Math.max(...types.map((t) => t.length), 4);
      const formatS = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

      lines.push("");
      lines.push("Per-job duration stats:");
      lines.push(
        `  ${"Type".padEnd(typeWidth)}  ${"Count".padStart(6)}  ${"Median".padStart(8)}  ${"Mean".padStart(8)}  ${"p90".padStart(8)}  ${"Max".padStart(8)}`,
      );
      for (const type of types) {
        const s = durationStats.get(type)!;
        lines.push(
          `  ${type.padEnd(typeWidth)}  ${String(s.count).padStart(6)}  ${formatS(s.median).padStart(8)}  ${formatS(s.mean).padStart(8)}  ${formatS(s.p90).padStart(8)}  ${formatS(s.max).padStart(8)}`,
        );
      }
    }
  }

  // Per-block data
  const processedTxs = parseProcessedTxs(data.processedTxs);
  const addingTxs = parseAddingTxs(data.addingTxs);
  const startingBlocks = parseStartingBlocks(data.startingBlock);
  const blocks = correlateBlocks(processedTxs, addingTxs, startingBlocks);

  if (blocks.length > 0) {
    lines.push("");
    lines.push(`Per block (sorted by block number):`);
    for (const block of blocks) {
      const time = block.processingTime.toFixed(1);
      lines.push(
        `  Block ${block.blockNumber} (slot ${block.slot}): ${block.txCount} txs, processing ${time}s`,
      );
    }
  }

  // Epoch proof duration
  const finalized = parseEpochFinalized(data.epochFinalized);
  if (finalized) {
    lines.push("");
    lines.push(`Epoch proof duration: ${finalized.duration}`);
  }

  return lines.join("\n");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const scanResult = await scanForEpoch();
  config.start = scanResult.start;
  config.end = scanResult.end;

  const data = await fetchAllData(scanResult.trace);
  const output = formatOutput(data);
  console.log(output);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
