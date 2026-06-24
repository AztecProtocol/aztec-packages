import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
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

import { type MockProxy, mock } from 'jest-mock-extended';

import { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import {
  INITIAL_CONSTRAINED_PROBE_LEN,
  UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN,
  syncTaggedPrivateLogs,
} from '../index.js';

const FAR_FUTURE_BLOCK_NUMBER = BlockNumber(100);
const CURRENT_TIMESTAMP = BigInt(Math.floor(Date.now() / 1000));
const ANCHOR_BLOCK_HEADER = BlockHeader.random({ blockNumber: FAR_FUTURE_BLOCK_NUMBER, timestamp: CURRENT_TIMESTAMP });
const JOB_ID = 'test-job';

describe('syncTaggedPrivateLogs', () => {
  const aztecNode: MockProxy<AztecNode> = mock<AztecNode>();
  let taggingStore: RecipientTaggingStore;

  function computeSiloedTagForIndex(secret: AppTaggingSecret, index: number) {
    return SiloedTag.compute({ extendedSecret: secret, index });
  }

  function makeLog(blockNumber: number, blockTimestamp: bigint, _tag: Fr) {
    return { ...randomLogResult(/* includeEffects */ true), blockNumber: BlockNumber(blockNumber), blockTimestamp };
  }

  /**
   * Extracts the bare-tag set from a query, defaulting `afterLog`-wrapped entries to their inner tag.
   */
  function extractTags(query: PrivateLogsQuery): SiloedTag[] {
    return query.tags.map((entry: TagQuery<SiloedTag>) => (entry instanceof SiloedTag ? entry : entry.tag));
  }

  function mockNodeWithLogs(logTags: SiloedTag[], blockNumber: number, blockTimestamp: bigint) {
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          const match = logTags.find(tag => tag.equals(t));
          return match ? [makeLog(blockNumber, blockTimestamp, match.value)] : [];
        }),
      );
    });
  }

  beforeEach(async () => {
    aztecNode.getPrivateLogsByTags.mockReset();
    taggingStore = new RecipientTaggingStore(await openTmpStore('test'));
  });

  it('returns empty array when given no secrets', async () => {
    const logs = await syncTaggedPrivateLogs([], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, BlockNumber(10), JOB_ID);

    expect(logs).toHaveLength(0);
    expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
  });

  it('returns empty array when no logs found for any secret', async () => {
    const secrets = await makeSecrets(3, AppTaggingSecretKind.UNCONSTRAINED);
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(tags.map(() => []));
    });

    const logs = await syncTaggedPrivateLogs(
      secrets,
      aztecNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      BlockNumber(10),
      JOB_ID,
    );

    expect(logs).toHaveLength(0);
  });

  it('batches tags from multiple secrets into a single RPC call', async () => {
    const secrets = await makeSecrets(3, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(tags.map(() => []));
    });

    await syncTaggedPrivateLogs(secrets, aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, finalizedBlockNumber, JOB_ID);

    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('syncs logs and updates store independently per secret', async () => {
    const secrets = await makeSecrets(3, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    const log1Index = 3;
    const log2Index = 7;
    const log1Tag = await computeSiloedTagForIndex(secrets[0], log1Index);
    const log2Tag = await computeSiloedTagForIndex(secrets[1], log2Index);

    mockNodeWithLogs([log1Tag, log2Tag], Number(finalizedBlockNumber), logBlockTimestamp);

    const logs = await syncTaggedPrivateLogs(
      secrets,
      aztecNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      finalizedBlockNumber,
      JOB_ID,
    );

    expect(logs).toHaveLength(2);
    expect(await taggingStore.getHighestAgedIndex(secrets[0], JOB_ID)).toBe(log1Index);
    expect(await taggingStore.getHighestFinalizedIndex(secrets[0], JOB_ID)).toBe(log1Index);
    expect(await taggingStore.getHighestAgedIndex(secrets[1], JOB_ID)).toBe(log2Index);
    expect(await taggingStore.getHighestFinalizedIndex(secrets[1], JOB_ID)).toBe(log2Index);
    // secrets[2] found nothing, so its store must be untouched
    expect(await taggingStore.getHighestAgedIndex(secrets[2], JOB_ID)).toBeUndefined();
    expect(await taggingStore.getHighestFinalizedIndex(secrets[2], JOB_ID)).toBeUndefined();
  });

  it('does not advance aged index for recent logs', async () => {
    const [secret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - 5000n; // not aged

    const logIndex = 5;
    const logTag = await computeSiloedTagForIndex(secret, logIndex);

    mockNodeWithLogs([logTag], Number(finalizedBlockNumber), logBlockTimestamp);

    await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, finalizedBlockNumber, JOB_ID);

    expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(logIndex);
    expect(await taggingStore.getHighestAgedIndex(secret, JOB_ID)).toBeUndefined();
  });

  it('updates store correctly when multiple iterations are needed', async () => {
    const [secret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);
    const agedBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    // A log at the last index of the initial window [0, WINDOW_LEN] moves the finalized index to WINDOW_LEN,
    // which shifts the next window forward and triggers a second iteration.
    const lastIndexInInitialWindow = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
    const log1Tag = await computeSiloedTagForIndex(secret, lastIndexInInitialWindow);

    // A second log sits in the advanced window, only reachable in the second iteration.
    const newWindowIndex = lastIndexInInitialWindow + 3;
    const log2Tag = await computeSiloedTagForIndex(secret, newWindowIndex);

    mockNodeWithLogs([log1Tag, log2Tag], Number(finalizedBlockNumber), agedBlockTimestamp);

    const logs = await syncTaggedPrivateLogs(
      [secret],
      aztecNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      finalizedBlockNumber,
      JOB_ID,
    );

    expect(logs).toHaveLength(2);
    expect(await taggingStore.getHighestAgedIndex(secret, JOB_ID)).toBe(newWindowIndex);
    expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(newWindowIndex);
  });

  it('respects pre-existing store indexes', async () => {
    const [secret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);

    const existingAgedIndex = 5;
    const existingFinalizedIndex = 8;
    await taggingStore.updateHighestAgedIndex(secret, existingAgedIndex, JOB_ID);
    await taggingStore.updateHighestFinalizedIndex(secret, existingFinalizedIndex, JOB_ID);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) =>
      Promise.resolve(query.tags.map(() => [])),
    );

    await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, finalizedBlockNumber, JOB_ID);

    const calledTags = extractTags(aztecNode.getPrivateLogsByTags.mock.calls[0][0]);

    // The query window must start at existingAgedIndex+1 and end at existingFinalizedIndex+WINDOW_LEN (inclusive).
    const expectedStart = existingAgedIndex + 1;
    const expectedEnd = existingFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
    const expectedTags = await Promise.all(
      Array.from({ length: expectedEnd - expectedStart + 1 }, (_, i) =>
        computeSiloedTagForIndex(secret, expectedStart + i),
      ),
    );

    expect(calledTags).toEqual(expectedTags);
  });

  it('handles multiple logs at the same tag index', async () => {
    const [secret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    const logIndex = 3;
    const logTag = await computeSiloedTagForIndex(secret, logIndex);

    // Two logs returned for the same tag
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag)
            ? [
                makeLog(Number(finalizedBlockNumber), logBlockTimestamp, logTag.value),
                makeLog(Number(finalizedBlockNumber), logBlockTimestamp, logTag.value),
              ]
            : [],
        ),
      );
    });

    const logs = await syncTaggedPrivateLogs(
      [secret],
      aztecNode,
      taggingStore,
      ANCHOR_BLOCK_HEADER,
      finalizedBlockNumber,
      JOB_ID,
    );

    expect(logs).toHaveLength(2);
  });

  describe('constrained secrets', () => {
    it('stops at first gap and does not track aged index', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(10);
      const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

      const logTags = await Promise.all([0, 1, 2].map(i => computeSiloedTagForIndex(secret, i)));
      mockNodeWithLogs(logTags, Number(finalizedBlockNumber), logBlockTimestamp);

      const logs = await syncTaggedPrivateLogs(
        [secret],
        aztecNode,
        taggingStore,
        ANCHOR_BLOCK_HEADER,
        finalizedBlockNumber,
        JOB_ID,
      );

      expect(logs).toHaveLength(3);
      expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(2);
      expect(await taggingStore.getHighestAgedIndex(secret, JOB_ID)).toBeUndefined();
    });

    it('fully drains a long contiguous run one probe at a time', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(10);
      const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

      const totalLogs = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN + 2;
      const logTags = await Promise.all(
        Array.from({ length: totalLogs }, (_, i) => computeSiloedTagForIndex(secret, i)),
      );

      mockNodeWithLogs(logTags, Number(finalizedBlockNumber), logBlockTimestamp);

      const logs = await syncTaggedPrivateLogs(
        [secret],
        aztecNode,
        taggingStore,
        ANCHOR_BLOCK_HEADER,
        finalizedBlockNumber,
        JOB_ID,
      );

      // The whole run is returned and the cursor lands on the last index, even though the run is longer than a single
      // window. With INITIAL_CONSTRAINED_PROBE_LEN = 1 the scan advances one index per round, so it takes one round
      // per log plus a final round for the terminating miss.
      expect(logs).toHaveLength(totalLogs);
      expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(totalLogs - 1);
      expect(aztecNode.getPrivateLogsByTags.mock.calls.length).toBe(totalLogs + 1);
    });

    it('persists cursor only up to finalized block', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(5);
      const oldTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;
      const recentTimestamp = CURRENT_TIMESTAMP - 5000n;

      const finalizedTags = await Promise.all([0, 1, 2, 3].map(i => computeSiloedTagForIndex(secret, i)));
      const unfinalizedTags = await Promise.all([4, 5].map(i => computeSiloedTagForIndex(secret, i)));

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
        const tags = extractTags(query);
        return Promise.resolve(
          tags.map((t: SiloedTag) => {
            if (finalizedTags.find(tag => tag.equals(t))) {
              return [makeLog(Number(finalizedBlockNumber), oldTimestamp, t.value)];
            }
            if (unfinalizedTags.find(tag => tag.equals(t))) {
              return [makeLog(8, recentTimestamp, t.value)];
            }
            return [];
          }),
        );
      });

      const logs = await syncTaggedPrivateLogs(
        [secret],
        aztecNode,
        taggingStore,
        ANCHOR_BLOCK_HEADER,
        finalizedBlockNumber,
        JOB_ID,
      );

      // The unfinalized logs (4, 5) are returned to the caller, but the durable cursor only advances to the finalized
      // prefix (3): probe advancement is decoupled from cursor persistence.
      expect(logs).toHaveLength(6);
      expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(3);
    });

    it('advances the probe past an unfinalized-only first probe', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(5);
      const recentTimestamp = CURRENT_TIMESTAMP - 5000n;

      // Indexes 0 and 1 are hits in an unfinalized block (8 > finalized 5); index 2 is the gap. With the small initial
      // probe, index 0 is probed alone and is unfinalized, so the scan must still advance to discover index 1 — gating
      // advancement on finalization (as an earlier design did) would drop it.
      const unfinalizedTags = await Promise.all([0, 1].map(i => computeSiloedTagForIndex(secret, i)));
      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
        const tags = extractTags(query);
        return Promise.resolve(
          tags.map((t: SiloedTag) =>
            unfinalizedTags.find(tag => tag.equals(t)) ? [makeLog(8, recentTimestamp, t.value)] : [],
          ),
        );
      });

      const logs = await syncTaggedPrivateLogs(
        [secret],
        aztecNode,
        taggingStore,
        ANCHOR_BLOCK_HEADER,
        finalizedBlockNumber,
        JOB_ID,
      );

      expect(logs).toHaveLength(2);
      // Nothing finalized, so the durable cursor must not advance.
      expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBeUndefined();
    });

    // Pins the committed P=1 behavior: a fully-consumed probe advances by one INITIAL_CONSTRAINED_PROBE_LEN step,
    // not the whole window.
    it('catch-up probes one step at a time, not the full window', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const finalizedBlockNumber = BlockNumber(10);
      const agedTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

      // Recipient already synced index 0; exactly one new finalized log sits at index 1.
      await taggingStore.updateHighestFinalizedIndex(secret, 0, JOB_ID);
      const newLogTag = await computeSiloedTagForIndex(secret, 1);
      mockNodeWithLogs([newLogTag], Number(finalizedBlockNumber), agedTimestamp);

      const logs = await syncTaggedPrivateLogs(
        [secret],
        aztecNode,
        taggingStore,
        ANCHOR_BLOCK_HEADER,
        finalizedBlockNumber,
        JOB_ID,
      );

      expect(logs).toHaveLength(1);
      expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(1);

      // Round 1 probes index 1 (the hit); round 2 probes only index 2 (the terminating miss) — a single
      // INITIAL_CONSTRAINED_PROBE_LEN step, not the full window. The old full-window fallback queried indexes
      // 2..(1 + WINDOW_LEN) in round 2.
      const calls = aztecNode.getPrivateLogsByTags.mock.calls;
      expect(calls).toHaveLength(2);
      expect(extractTags(calls[0][0])).toEqual([await computeSiloedTagForIndex(secret, 1)]);
      expect(extractTags(calls[1][0])).toEqual([await computeSiloedTagForIndex(secret, 2)]);
    });
  });

  describe('constrained vs unconstrained probing', () => {
    it('constrained steady-state probes only INITIAL_CONSTRAINED_PROBE_LEN tags', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const finalizedIndex = 8;
      await taggingStore.updateHighestFinalizedIndex(secret, finalizedIndex, JOB_ID);

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) =>
        Promise.resolve(query.tags.map(() => [])),
      );

      await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, BlockNumber(10), JOB_ID);

      // Gapless stream: the first missing tag ends the scan, so steady state probes just the initial window.
      const calledTags = extractTags(aztecNode.getPrivateLogsByTags.mock.calls[0][0]);
      const expectedTags = await Promise.all(
        Array.from({ length: INITIAL_CONSTRAINED_PROBE_LEN }, (_, i) =>
          computeSiloedTagForIndex(secret, finalizedIndex + 1 + i),
        ),
      );
      expect(calledTags).toEqual(expectedTags);
    });

    it('unconstrained steady-state probes the full window', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
      const cursor = 8;
      await taggingStore.updateHighestAgedIndex(secret, cursor, JOB_ID);
      await taggingStore.updateHighestFinalizedIndex(secret, cursor, JOB_ID);

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) =>
        Promise.resolve(query.tags.map(() => [])),
      );

      await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, BlockNumber(10), JOB_ID);

      // Unconstrained streams can have gaps, so the full window is always probed — the same cursor that costs one tag
      // for a constrained secret costs a full window here.
      const calledTags = extractTags(aztecNode.getPrivateLogsByTags.mock.calls[0][0]);
      const expectedStart = cursor + 1;
      const expectedEnd = cursor + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
      const expectedTags = await Promise.all(
        Array.from({ length: expectedEnd - expectedStart + 1 }, (_, i) =>
          computeSiloedTagForIndex(secret, expectedStart + i),
        ),
      );
      expect(calledTags).toEqual(expectedTags);
    });
  });

  describe('mixed constrained and unconstrained secrets', () => {
    it('batches both kinds into a single RPC call with different stop conditions', async () => {
      const [constrainedSecret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const [unconstrainedSecret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
      const finalizedBlockNumber = BlockNumber(10);
      const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

      const constrainedLogTags = await Promise.all([0, 1].map(i => computeSiloedTagForIndex(constrainedSecret, i)));
      const unconstrainedLogTags = await Promise.all([0, 5].map(i => computeSiloedTagForIndex(unconstrainedSecret, i)));

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
        const tags = extractTags(query);
        return Promise.resolve(
          tags.map((t: SiloedTag) => {
            const cMatch = constrainedLogTags.find(tag => tag.equals(t));
            const uMatch = unconstrainedLogTags.find(tag => tag.equals(t));
            if (cMatch || uMatch) {
              return [makeLog(Number(finalizedBlockNumber), logBlockTimestamp, t.value)];
            }
            return [];
          }),
        );
      });

      const logs = await syncTaggedPrivateLogs(
        [constrainedSecret, unconstrainedSecret],
        aztecNode,
        taggingStore,
        ANCHOR_BLOCK_HEADER,
        finalizedBlockNumber,
        JOB_ID,
      );

      expect(logs).toHaveLength(4);
      expect(await taggingStore.getHighestFinalizedIndex(constrainedSecret, JOB_ID)).toBe(1);
      expect(await taggingStore.getHighestAgedIndex(constrainedSecret, JOB_ID)).toBeUndefined();
      expect(await taggingStore.getHighestFinalizedIndex(unconstrainedSecret, JOB_ID)).toBe(5);
    });
  });

  it('caps the node query at anchorBlockNumber + 1 (toBlock exclusive)', async () => {
    const [secret] = await makeSecrets(1, AppTaggingSecretKind.UNCONSTRAINED);
    const anchorBlock = BlockNumber(10);
    const header = BlockHeader.random({ blockNumber: anchorBlock, timestamp: CURRENT_TIMESTAMP });
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    const logIndex = 3;
    const logTag = await computeSiloedTagForIndex(secret, logIndex);

    // The mock simulates the node honoring `toBlock` (exclusive). Recipient sync now relies on the node
    // for this filter rather than dropping post-anchor logs client-side.
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      const toBlockExclusive = Number(query.toBlock ?? Infinity);
      const allCandidates = [
        makeLog(Number(anchorBlock) - 1, logBlockTimestamp, logTag.value),
        makeLog(Number(anchorBlock), logBlockTimestamp, logTag.value),
        makeLog(Number(anchorBlock) + 1, logBlockTimestamp, logTag.value),
      ];
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag) ? allCandidates.filter(l => Number(l.blockNumber) < toBlockExclusive) : [],
        ),
      );
    });

    const logs = await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, header, finalizedBlockNumber, JOB_ID);

    // Only logs at or before the anchor block should be included — node-side filter drops the post-anchor log.
    expect(logs).toHaveLength(2);
    // Verify the node was called with toBlock = anchorBlock + 1 (exclusive upper bound).
    expect(aztecNode.getPrivateLogsByTags.mock.calls[0][0].toBlock).toBe(BlockNumber(Number(anchorBlock) + 1));
  });
});

function makeSecrets(count: number, kind: AppTaggingSecretKind): Promise<AppTaggingSecret[]> {
  return Promise.all(Array.from({ length: count }, () => randomAppTaggingSecret(kind)));
}
