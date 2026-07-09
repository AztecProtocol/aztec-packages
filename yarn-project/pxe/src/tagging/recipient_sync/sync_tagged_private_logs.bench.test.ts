import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
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
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN, syncTaggedPrivateLogs } from '../index.js';

/**
 * Benchmark for constrained recipient tag-sync.
 *
 * Measures the per-sync cost of `syncTaggedPrivateLogs` for constrained secrets. Constrained streams are gapless, so
 * the scan probes a small initial window (`INITIAL_CONSTRAINED_PROBE_LEN`) and doubles it each round (capped at the
 * `UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN` window), stopping at the first missing tag instead of fetching the
 * full window. This only reports costs; the scan behavior itself (probe schedules, round counts) is pinned by the
 * unit tests in `sync_tagged_private_logs.test.ts`, which run in CI while this bench is opt-in.
 *
 * Manual run:
 * ```bash
 * RUN_TAG_SYNC_BENCH=1 JEST_MAX_WORKERS=1 BENCH_OUTPUT=/tmp/tag-sync-bench-current.json \
 *   yarn workspace @aztec/pxe test src/tagging/recipient_sync/sync_tagged_private_logs.bench.test.ts
 * ```
 *
 * Metrics, per scenario:
 * - `tag-queries`: total tags queried, the throughput win.
 * - `rpc-round-trips`: sequential blocking waits on the node, via `BenchmarkedNodeFactory`.
 *    The latency axis: doubling grows the probe geometrically, so round-trips rise only ~log2(K) while the
 *    probe is still doubling, then linearly at ~K/WINDOW_LEN once it saturates the cap.
 *    Depends only on K, not on secret count. A round's tags are chunked at MAX_RPC_LEN (=100) into parallel calls
 *   internally, but those overlap, so a wide round is still one round-trip; that is why
 *   round-trips, not raw call count, is the latency axis.
 * - `rpc-blocking-time`: measured wall-clock the caller blocks on the node, under a modeled
 *   `MODELED_NODE_RPC_LATENCY_MS` per call plus a little per-round overhead. Parallel calls within a round overlap, so
 *   it tracks round-trips (a 1000-secret round is many parallel chunks but ~one round-trip of blocking time).
 *
 * Scenario labels: `steady-state` is no new logs (K = 0); `catch-up-K` is K new contiguous logs per secret since the
 * last sync; `secrets=N` is N secrets synced together in one batched pass. Because round-trips depend only on K (not
 * N), the light catch-up scenarios run at both 100 and 1000 secrets to show tag-queries scale with N while round-trips
 * do not. The `mixed` row is the realistic active sync (999 idle secrets + 1 deep straggler at K = 100): it isolates
 * that tag-queries stay dominated by the idle majority while a single straggler alone sets the round-trip count.
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

const describeBench = process.env.RUN_TAG_SYNC_BENCH ? describe : describe.skip;

/** One benchmark measurement in the benchmark JSON shape. */
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
  /**
   * Optional heterogeneous load: the first `count` secrets get `newLogs` new logs each, the remaining
   * `secretCount - count` are idle (K = 0). When set, the scenario-level `newLogs` is ignored. Models a realistic
   * sync where most senders are quiet and a few are deep in catch-up.
   */
  deepCohort?: { count: number; newLogs: number };
};

/**
 * The per-secret new-log distribution for a scenario: `deepCohort.count` secrets at `deepCohort.newLogs`, the rest
 * idle, or a uniform `newLogs` for every secret when no cohort is set. Single source for both log seeding and the
 * seeding sanity check.
 */
function newLogsPerSecret(scenario: Scenario): number[] {
  return Array.from({ length: scenario.secretCount }, (_, i) =>
    scenario.deepCohort && i < scenario.deepCohort.count ? scenario.deepCohort.newLogs : scenario.newLogs,
  );
}

const SCENARIOS: Scenario[] = [
  // steady-state (K = 0): no new logs since the last sync, across recipient secret counts. The dominant case and where
  // first-miss wins by roughly the window size.
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
  // Deep catch-up at 100 and 1000 secrets (the negative case): round-trips grow one per probe step while tag-queries
  // stay at the K + 1 floor. From a full window up, the WINDOW_LEN cap forces multiple rounds at any P. As with light
  // catch-up, round-trips depend only on K and P (not N), so the two secret counts share a round-trip count and differ
  // only in tag-queries (10x) and blocking time.
  ...[100, 1000].flatMap(secretCount =>
    [UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN, 50, 100].map(newLogs => ({
      label: `constrained/catch-up-${newLogs}/secrets=${secretCount}`,
      kind: AppTaggingSecretKind.CONSTRAINED,
      secretCount,
      priorCursor: 0,
      newLogs,
    })),
  ),
  // Mixed (the realistic active sync): 999 idle senders + 1 deep straggler (K = 100). Tag-queries stay dominated by the
  // idle majority, but the single straggler alone sets the round-trip count (tags are batched across all secrets per
  // round, so the round count equals the deepest secret's), so round-trips match catch-up-100.
  {
    label: `constrained/mixed/secrets=1000`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount: 1000,
    priorCursor: 0,
    newLogs: 0,
    deepCohort: { count: 1, newLogs: 100 },
  },
  // Control: unconstrained steady state is unaffected by the optimization (windowed scan cannot first-miss).
  {
    label: `unconstrained/steady-state/secrets=100`,
    kind: AppTaggingSecretKind.UNCONSTRAINED,
    secretCount: 100,
    priorCursor: 0,
    newLogs: 0,
  },
];

describeBench('syncTaggedPrivateLogs constrained-sync bench', () => {
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
    const { kind, secretCount, priorCursor } = scenario;
    const perSecretNewLogs = newLogsPerSecret(scenario);

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

    // Tags that should resolve to a finalized log: per secret, the contiguous run (priorCursor, priorCursor + K].
    const hitTags = new Set<string>();
    for (let s = 0; s < secrets.length; s++) {
      for (let k = 1; k <= perSecretNewLogs[s]; k++) {
        hitTags.add((await computeSiloedTagForIndex(secrets[s], priorCursor + k)).toString());
      }
    }

    aztecNode.getPrivateLogsByTags.mockImplementation(async (query: PrivateLogsQuery) => {
      await sleep(MODELED_NODE_RPC_LATENCY_MS);
      return extractTags(query).map(tag => (hitTags.has(tag.toString()) ? [makeFinalizedLog()] : []));
    });

    // Wrap the node so we capture round-trips and blocking time the same way the client_flows app benches do. The
    // Proxy delegates to the underlying mock, so `mock.calls` still records every query for tag counting.
    const benchmarkedNode = BenchmarkedNodeFactory.create(aztecNode);

    const logs = await syncTaggedPrivateLogs(
      secrets,
      benchmarkedNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      FINALIZED_BLOCK_NUMBER,
      JOB_ID,
    );

    const calls = aztecNode.getPrivateLogsByTags.mock.calls;
    const tagQueries = calls.reduce((sum, [query]) => sum + extractTags(query).length, 0);

    // Round-trips and blocking time from the same instrumentation the app benches use. `syncTaggedPrivateLogs` only
    // ever calls `getPrivateLogsByTags`, so every round-trip is that method.
    const { roundTrips } = benchmarkedNode.getStats();
    const rpcRoundTrips = roundTrips.roundTrips;
    const rpcBlockingTimeMs = roundTrips.totalBlockingTime;

    // First-miss floor: each secret pays its K hits + 1 miss. Unconstrained cannot first-miss, so its floor is
    // its current cost.
    const firstMissOptimum =
      kind === AppTaggingSecretKind.CONSTRAINED ? perSecretNewLogs.reduce((sum, k) => sum + k + 1, 0) : tagQueries;

    return {
      ...scenario,
      logsFound: logs.length,
      tagQueries,
      rpcRoundTrips,
      rpcBlockingTimeMs,
      firstMissOptimum,
    };
  }

  it('reports per-sync tag-queries, round-trips, and blocking time', async () => {
    const rows = [];
    for (const scenario of SCENARIOS) {
      const row = await runScenario(scenario);
      rows.push(row);
      logger.info(
        `${row.label.padEnd(42)} tag-queries=${String(row.tagQueries).padStart(6)} ` +
          `first-miss-optimum=${String(row.firstMissOptimum).padStart(6)} ` +
          `reduction=${(row.tagQueries / row.firstMissOptimum).toFixed(1)}x ` +
          `round-trips=${String(row.rpcRoundTrips).padStart(4)} ` +
          `blocking=${row.rpcBlockingTimeMs.toFixed(0).padStart(4)}ms logs=${String(row.logsFound).padStart(5)}`,
      );

      // Seeding sanity check only: every seeded log must be found, or the reported numbers measure a broken harness.
      // Scan behavior (probe schedules, round counts) is pinned by the unit tests, which run in CI while this does not.
      expect(row.logsFound).toBe(newLogsPerSecret(scenario).reduce((sum, k) => sum + k, 0));

      // Steady state is one round trip by construction: every secret first-misses in round one, independent of secret
      // count, so a wide round's chunked parallel RPC calls must count as a single blocking wait. Guards the round-trip
      // accounting at widths the unit tests don't reach (they count RPC calls, not round trips).
      if (scenario.newLogs === 0 && !scenario.deepCohort) {
        expect(row.rpcRoundTrips).toBe(1);
      }
    }

    const results: BenchResult[] = rows.flatMap(row => [
      { name: `TagSync/${row.label}/tag-queries`, value: row.tagQueries, unit: 'tag-queries' },
      { name: `TagSync/${row.label}/rpc-round-trips`, value: row.rpcRoundTrips, unit: 'round_trips' },
      { name: `TagSync/${row.label}/rpc-blocking-time`, value: Number(row.rpcBlockingTimeMs.toFixed(2)), unit: 'ms' },
    ]);

    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(results, null, 2));
    }
  }, 600_000);
});
