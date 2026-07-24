import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
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
import { UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN, syncTaggedPrivateLogs } from '../index.js';

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

  it('batches tags from multiple secrets across as few RPC calls as MAX_RPC_LEN allows', async () => {
    // Pick enough secrets that the total tag count spans several MAX_RPC_LEN chunks. A per-secret
    // implementation would need one RPC per secret; batched behavior needs ceil(totalTags / MAX_RPC_LEN).
    const numSecrets = 10;
    const secrets = await makeSecrets(numSecrets, AppTaggingSecretKind.UNCONSTRAINED);
    const finalizedBlockNumber = BlockNumber(10);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(tags.map(() => []));
    });

    await syncTaggedPrivateLogs(secrets, aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, finalizedBlockNumber, JOB_ID);

    const expectedTags = await Promise.all(
      secrets.flatMap(secret =>
        Array.from({ length: UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN }, (_, i) =>
          computeSiloedTagForIndex(secret, i),
        ),
      ),
    );
    const calledTags = aztecNode.getPrivateLogsByTags.mock.calls.flatMap(([query]) => extractTags(query));
    const asStrings = (tags: SiloedTag[]) => tags.map(t => t.toString()).sort();

    // Every expected (secret, index) tag was queried exactly once, in some order across the batched RPC calls.
    expect(asStrings(calledTags)).toEqual(asStrings(expectedTags));

    // Batching invariant: the sync issues ceil(totalTags / MAX_RPC_LEN) calls, which is strictly fewer than one
    // RPC per secret. This is what a per-secret implementation would degenerate to.
    const expectedCalls = Math.ceil(expectedTags.length / MAX_RPC_LEN);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(expectedCalls);
    expect(expectedCalls).toBeLessThan(numSecrets);
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

    // A log at the last index of the initial window [0, WINDOW_LEN) moves the finalized index to WINDOW_LEN - 1,
    // which shifts the next window forward and triggers a second iteration.
    const lastIndexInInitialWindow = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN - 1;
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

    it('continues when all indexes in the batch have logs', async () => {
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

      expect(logs).toHaveLength(totalLogs);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
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

      expect(logs).toHaveLength(6);
      expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(3);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
    });

    it('respects pre-existing finalized index', async () => {
      const [secret] = await makeSecrets(1, AppTaggingSecretKind.CONSTRAINED);
      const existingFinalizedIndex = 5;
      await taggingStore.updateHighestFinalizedIndex(secret, existingFinalizedIndex, JOB_ID);

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) =>
        Promise.resolve(query.tags.map(() => [])),
      );

      await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, BlockNumber(10), JOB_ID);

      const calledTags = extractTags(aztecNode.getPrivateLogsByTags.mock.calls[0][0]);

      const expectedStart = existingFinalizedIndex + 1;
      const expectedEnd = existingFinalizedIndex + UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
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
