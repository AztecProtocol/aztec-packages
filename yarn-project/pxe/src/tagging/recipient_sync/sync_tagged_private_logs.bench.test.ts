import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';
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

import { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import {
  INITIAL_CONSTRAINED_PROBE_LEN,
  UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
  syncTaggedPrivateLogs,
} from '../index.js';

/**
 * Benchmark for constrained recipient tag-sync.
 *
 * Measures the per-sync tag-query cost of `syncTaggedPrivateLogs` for constrained secrets. Constrained streams are
 * gapless, so the scan probes a small initial window (`INITIAL_CONSTRAINED_PROBE_LEN`) and stops at the first missing
 * tag instead of always fetching the full `UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN` (=20) window. The headline metric is
 * the total number of tags queried across the node (`getPrivateLogsByTags`) calls; at steady state (no new logs) it
 * drops from a full window per secret to a single tag.
 *
 * The "first-miss optimum" column is the theoretical floor a first-miss scan targets ("new logs + one miss" per
 * secret); the reduction column shows how close each scenario gets to it. An unconstrained row is included as a
 * control: it cannot first-miss (windowed scan), so its optimum equals its cost.
 */

const logger = createLogger('pxe:tagging:bench');

const FINALIZED_BLOCK_NUMBER = BlockNumber(10);
const ANCHOR_BLOCK_NUMBER = BlockNumber(100);
const CURRENT_TIMESTAMP = BigInt(Math.floor(Date.now() / 1000));
const ANCHOR_BLOCK_HEADER = BlockHeader.random({ blockNumber: ANCHOR_BLOCK_NUMBER, timestamp: CURRENT_TIMESTAMP });
const AGED_TIMESTAMP = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;
const JOB_ID = 'bench-job';

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
  // Steady state (no new logs) across recipient secret counts — the dominant case and where first-miss wins ~20x.
  ...[1, 10, 100, 1000].map(secretCount => ({
    label: `constrained/steady-state/secrets=${secretCount}`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount,
    priorCursor: 0,
    newLogs: 0,
  })),
  // Single new message per secret since last sync — the case that most distinguishes INITIAL_CONSTRAINED_PROBE_LEN
  // values (a probe of P resolves K < P new logs in a single round).
  {
    label: `constrained/catch-up-1/secrets=100`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount: 100,
    priorCursor: 0,
    newLogs: 1,
  },
  // Light catch-up: a couple of new messages per secret since last sync.
  {
    label: `constrained/catch-up-3/secrets=100`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount: 100,
    priorCursor: 0,
    newLogs: 3,
  },
  // Window-edge catch-up: a full window of new messages forces a second round under the fixed-window scan.
  {
    label: `constrained/catch-up-${UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN}/secrets=100`,
    kind: AppTaggingSecretKind.CONSTRAINED,
    secretCount: 100,
    priorCursor: 0,
    newLogs: UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
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

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) =>
      Promise.resolve(extractTags(query).map(tag => (hitTags.has(tag.toString()) ? [makeFinalizedLog()] : []))),
    );

    const timer = new Timer();
    const logs = await syncTaggedPrivateLogs(
      secrets,
      aztecNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      FINALIZED_BLOCK_NUMBER,
      JOB_ID,
    );
    const syncMs = timer.ms();

    const calls = aztecNode.getPrivateLogsByTags.mock.calls;
    const tagQueries = calls.reduce((sum, [query]) => sum + extractTags(query).length, 0);
    const nodeCalls = calls.length;

    // First-miss floor: each secret pays `newLogs` hits + 1 miss. Unconstrained cannot first-miss, so its floor is
    // its current cost.
    const firstMissOptimum = kind === AppTaggingSecretKind.CONSTRAINED ? secretCount * (newLogs + 1) : tagQueries;

    return { ...scenario, logsFound: logs.length, tagQueries, nodeCalls, syncMs, firstMissOptimum };
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
          `node-calls=${String(row.nodeCalls).padStart(4)} logs=${String(row.logsFound).padStart(5)} ` +
          `time=${row.syncMs.toFixed(1)}ms`,
      );

      // Pin behavior as an executable assertion, not just a printout.
      if (scenario.newLogs === 0) {
        if (scenario.kind === AppTaggingSecretKind.CONSTRAINED) {
          // Constrained steady state: the first missing tag ends the scan, so we query only the initial probe.
          expect(row.tagQueries).toBe(scenario.secretCount * INITIAL_CONSTRAINED_PROBE_LEN);
        } else {
          // Unconstrained steady state: still the full window (control for the optimization).
          expect(row.tagQueries).toBe(scenario.secretCount * UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN);
        }
        expect(row.logsFound).toBe(0);
      }
      expect(row.logsFound).toBe(scenario.secretCount * scenario.newLogs);
    }

    const results: BenchResult[] = rows.flatMap(row => [
      { name: `TagSync/${row.label}/tag-queries`, value: row.tagQueries, unit: 'tag-queries' },
      { name: `TagSync/${row.label}/node-calls`, value: row.nodeCalls, unit: 'calls' },
      { name: `TagSync/${row.label}/sync-time`, value: Number(row.syncMs.toFixed(2)), unit: 'ms' },
    ]);

    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(results, null, 2));
    }
  }, 600_000);
});
