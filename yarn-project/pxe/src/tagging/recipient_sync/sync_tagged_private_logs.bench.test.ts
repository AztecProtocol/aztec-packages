import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  type AppTaggingSecret,
  AppTaggingSecretKind,
  type PrivateLogsQuery,
  SiloedTag,
  type TagQuery,
  randomLogResult,
} from '@aztec/stdlib/logs';
import { randomAppTaggingSecret } from '@aztec/stdlib/testing';
import { BlockHeader } from '@aztec/stdlib/tx';

import { mkdir, writeFile } from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';
import path from 'path';

import { BenchmarkedNodeFactory } from '../../contract_function_simulator/benchmarked_node.js';
import { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import {
  INITIAL_CONSTRAINED_PROBE_LEN,
  UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
  syncTaggedPrivateLogs,
} from '../index.js';

/**
 * Benchmark for constrained recipient tag-sync.
 *
 * Measures the per-sync cost of `syncTaggedPrivateLogs` for constrained secrets. Constrained streams are gapless, so
 * the scan probes a small initial window (`INITIAL_CONSTRAINED_PROBE_LEN`) and grows one such step at a time, stopping
 * at the first missing tag instead of fetching the full `UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN` (=20) window.
 *
 * Metrics, per scenario:
 * - `tag-queries`: total tags queried, the throughput win. At steady state it drops from a full window per secret to a
 *   single tag; a secret with K new logs costs exactly K + 1 (the "first-miss optimum" floor, reduction 1.0x).
 * - `rpc-round-trips`: sequential blocking waits on the node (parallel `Promise.all` calls within a round count as one),
 *   via `BenchmarkedNodeFactory`. The latency axis: fixed-step trades fewer tags for more round-trips, so it grows
 *   ~linearly with K during catch-up while tag-queries stay at the floor. Depends only on K and P, not on secret count.
 *   A round's tags are chunked at MAX_RPC_LEN (=100) into parallel calls internally, but those overlap, so a wide round
 *   is still one round-trip; that is why round-trips, not raw call count, is the latency axis.
 * - `rpc-blocking-time`: measured wall-clock the caller blocks on the node, under a modeled `MODELED_NODE_RPC_LATENCY_MS`
 *   per call plus a little per-round overhead. Parallel calls within a round overlap, so it tracks round-trips (a
 *   1000-secret round is many parallel chunks but ~one round-trip of blocking time). Reported only (varies run to run).
 *
 * Scenario labels: `steady-state` is no new logs (K = 0); `catch-up-K` is K new contiguous logs per secret since the
 * last sync; `secrets=N` is N secrets synced together in one batched pass. Because round-trips depend only on K and P
 * (not N), the light catch-up scenarios run at both 100 and 1000 secrets to show tag-queries scale with N while
 * round-trips do not. The `unconstrained` row is the control: it cannot first-miss (windowed scan), so its cost is fixed.
 */

const logger = createLogger('pxe:tagging:bench');

const FINALIZED_BLOCK_NUMBER = BlockNumber(10);
const ANCHOR_BLOCK_NUMBER = BlockNumber(100);
const CURRENT_TIMESTAMP = BigInt(Math.floor(Date.now() / 1000));
const ANCHOR_BLOCK_HEADER = BlockHeader.random({ blockNumber: ANCHOR_BLOCK_NUMBER, timestamp: CURRENT_TIMESTAMP });
const AGED_TIMESTAMP = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;
const JOB_ID = 'bench-job';

// Models per-call node RPC latency so round-trip blocking time is meaningful against an otherwise-instant mock node.
// The round-trip *count* is independent of this value; only `rpc-blocking-time` scales with it.
const MODELED_NODE_RPC_LATENCY_MS = 5;

/** One benchmark measurement in the GitHub-action benchmark JSON shape. */
type BenchResult = { name: string; value: number; unit: string };

type Scenario = {
  label: string;
  kind: AppTaggingSecretKind;
  /** Number of secrets the recipient holds for this directional app. */
  secretCount: number;
  /** Highest finalized index already persisted before the sync (recipient has `priorCursor + 1` prior messages). */
  priorCursor: number;
  /** New contiguous finalized logs available per secret since the last sync (0 = steady state). */
  newLogs: number;
};

const SCENARIOS: Scenario[] = [
  // steady-state (K = 0): no new logs since the last sync, across recipient secret counts. The dominant case and where
  // first-miss wins ~20x.
  ...[1, 10, 100, 1000].map(secretCount => ({
    label: `constrained/steady-state/secrets=${secretCount}`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount,
    priorCursor: 0,
    newLogs: 0,
  })),
  // Light catch-up (K new logs per secret) at 100 and 1000 secrets. Round-trips depend only on K and P, not on N, so
  // the two secret counts share a round-trip count and differ only in tag-queries (10x) and blocking time.
  ...[100, 1000].flatMap(secretCount =>
    [1, 3].map(newLogs => ({
      label: `constrained/catch-up-${newLogs}/secrets=${secretCount}`,
      kind: AppTaggingSecretKind.CONSTRAINED,
      secretCount,
      priorCursor: 0,
      newLogs,
    })),
  ),
  // Deep catch-up at 100 secrets (the negative case): round-trips grow one per probe step while tag-queries stay at the
  // K + 1 floor. From a full window (catch-up-20) up, the WINDOW_LEN cap forces multiple rounds at any P.
  ...[UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN, 50, 100].map(newLogs => ({
    label: `constrained/catch-up-${newLogs}/secrets=100`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount: 100,
    priorCursor: 0,
    newLogs,
  })),
  // Control: unconstrained steady state is unaffected by the optimization (windowed scan cannot first-miss).
  {
    label: `unconstrained/steady-state/secrets=100`,
    kind: AppTaggingSecretKind.UNCONSTRAINED,
    secretCount: 100,
    priorCursor: 0,
    newLogs: 0,
  },
];

describe('syncTaggedPrivateLogs constrained-sync bench', () => {
  const aztecNode: MockProxy<AztecNode> = mock<AztecNode>();

  function computeSiloedTagForIndex(secret: AppTaggingSecret, index: number) {
    return SiloedTag.compute({ extendedSecret: secret, index });
  }

  function extractTags(query: PrivateLogsQuery): SiloedTag[] {
    return query.tags.map((entry: TagQuery<SiloedTag>) => (entry instanceof SiloedTag ? entry : entry.tag));
  }

  function makeFinalizedLog() {
    return {
      ...randomLogResult(/* includeEffects */ true),
      blockNumber: FINALIZED_BLOCK_NUMBER,
      blockTimestamp: AGED_TIMESTAMP,
    };
  }

  async function runScenario(scenario: Scenario) {
    const { kind, secretCount, priorCursor, newLogs } = scenario;

    aztecNode.getPrivateLogsByTags.mockReset();
    const taggingStore = new RecipientTaggingStore(await openTmpStore('bench'));
    const secrets = await Promise.all(Array.from({ length: secretCount }, () => randomAppTaggingSecret(kind)));

    // Seed the persisted cursor(s) to simulate a recipient that already synced prior finalized messages.
    for (const secret of secrets) {
      await taggingStore.updateHighestFinalizedIndex(secret, priorCursor, JOB_ID);
      if (kind === AppTaggingSecretKind.UNCONSTRAINED) {
        await taggingStore.updateHighestAgedIndex(secret, priorCursor, JOB_ID);
      }
    }

    // Tags that should resolve to a finalized log: the contiguous run (priorCursor, priorCursor + newLogs].
    const hitTags = new Set<string>();
    for (const secret of secrets) {
      for (let k = 1; k <= newLogs; k++) {
        hitTags.add((await computeSiloedTagForIndex(secret, priorCursor + k)).toString());
      }
    }

    aztecNode.getPrivateLogsByTags.mockImplementation(async (query: PrivateLogsQuery) => {
      await sleep(MODELED_NODE_RPC_LATENCY_MS);
      return extractTags(query).map(tag => (hitTags.has(tag.toString()) ? [makeFinalizedLog()] : []));
    });

    // Wrap the node so we capture round-trips and blocking time the same way the client_flows app benches do. The
    // Proxy delegates to the underlying mock, so `mock.calls` still records every query for tag counting.
    const benchmarkedNode = BenchmarkedNodeFactory.create(aztecNode);

    const timer = new Timer();
    const logs = await syncTaggedPrivateLogs(
      secrets,
      benchmarkedNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      FINALIZED_BLOCK_NUMBER,
      JOB_ID,
    );
    const syncMs = timer.ms();

    const calls = aztecNode.getPrivateLogsByTags.mock.calls;
    const tagQueries = calls.reduce((sum, [query]) => sum + extractTags(query).length, 0);

    // Round-trips and blocking time from the same instrumentation the app benches use. `syncTaggedPrivateLogs` only
    // ever calls `getPrivateLogsByTags`, so every round-trip is that method.
    const { roundTrips } = benchmarkedNode.getStats();
    const rpcRoundTrips = roundTrips.roundTrips;
    const rpcBlockingTimeMs = roundTrips.totalBlockingTime;

    // First-miss floor: each secret pays `newLogs` hits + 1 miss. Unconstrained cannot first-miss, so its floor is
    // its current cost.
    const firstMissOptimum = kind === AppTaggingSecretKind.CONSTRAINED ? secretCount * (newLogs + 1) : tagQueries;

    return {
      ...scenario,
      logsFound: logs.length,
      tagQueries,
      rpcRoundTrips,
      rpcBlockingTimeMs,
      syncMs,
      firstMissOptimum,
    };
  }

  it('measures tag-query cost per sync', async () => {
    const rows = [];
    for (const scenario of SCENARIOS) {
      const row = await runScenario(scenario);
      rows.push(row);
      logger.info(
        `${row.label.padEnd(42)} tag-queries=${String(row.tagQueries).padStart(6)} ` +
          `first-miss-optimum=${String(row.firstMissOptimum).padStart(6)} ` +
          `reduction=${(row.tagQueries / row.firstMissOptimum).toFixed(1)}x ` +
          `round-trips=${String(row.rpcRoundTrips).padStart(4)} ` +
          `blocking=${row.rpcBlockingTimeMs.toFixed(0).padStart(4)}ms logs=${String(row.logsFound).padStart(5)} ` +
          `time=${row.syncMs.toFixed(1)}ms`,
      );

      // Pin behavior as an executable assertion, not just a printout. Timings are reported only (they vary run to run).
      if (scenario.kind === AppTaggingSecretKind.CONSTRAINED) {
        // Fixed-step probing is tag-optimal: K hits plus 1 terminating miss, rounded up to whole probe steps. At
        // INITIAL_CONSTRAINED_PROBE_LEN = 1 this equals the first-miss floor (reduction = 1.0x), and at steady state
        // (K = 0) it collapses to a single initial probe per secret.
        const stepsToFirstMiss = Math.ceil((scenario.newLogs + 1) / INITIAL_CONSTRAINED_PROBE_LEN);
        expect(row.tagQueries).toBe(scenario.secretCount * stepsToFirstMiss * INITIAL_CONSTRAINED_PROBE_LEN);
        // One sequential round-trip per probe step (the negative-case cost), independent of chunking and secret count.
        expect(row.rpcRoundTrips).toBe(stepsToFirstMiss);
      } else if (scenario.newLogs === 0) {
        // Unconstrained steady state: still the full window (control for the optimization), drained in one round.
        expect(row.tagQueries).toBe(scenario.secretCount * UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN);
        expect(row.rpcRoundTrips).toBe(1);
      }
      expect(row.logsFound).toBe(scenario.secretCount * scenario.newLogs);
    }

    const results: BenchResult[] = rows.flatMap(row => [
      { name: `TagSync/${row.label}/tag-queries`, value: row.tagQueries, unit: 'tag-queries' },
      { name: `TagSync/${row.label}/rpc-round-trips`, value: row.rpcRoundTrips, unit: 'round_trips' },
      { name: `TagSync/${row.label}/rpc-blocking-time`, value: Number(row.rpcBlockingTimeMs.toFixed(2)), unit: 'ms' },
      { name: `TagSync/${row.label}/sync-time`, value: Number(row.syncMs.toFixed(2)), unit: 'ms' },
    ]);

    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(results, null, 2));
    }
  }, 600_000);
});
