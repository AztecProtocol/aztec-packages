import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  type AppTaggingSecret,
  AppTaggingSecretKind,
  LogResult,
  type PrivateLogsQuery,
  SiloedTag,
  type TagQuery,
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
    const random = LogResult.random(/* includeEffects */ true);
    return LogResult.from({ ...random, blockNumber: BlockNumber(blockNumber), blockTimestamp });
  }

  /**
   * Extracts the bare-tag set from a query, defaulting `afterLog`-wrapped entries to their inner tag.
   */
  function extractTags(query: PrivateLogsQuery): SiloedTag[] {
    return query.tags.map((entry: TagQuery<SiloedTag>) => (entry instanceof SiloedTag ? entry : entry.tag));
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
    const secrets = await makeSecrets(3);
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
    const secrets = await makeSecrets(3);
    const finalizedBlockNumber = BlockNumber(10);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(tags.map(() => []));
    });

    await syncTaggedPrivateLogs(secrets, aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, finalizedBlockNumber, JOB_ID);

    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('syncs logs and updates store independently per secret', async () => {
    const secrets = await makeSecrets(3);
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    const log1Index = 3;
    const log2Index = 7;
    const log1Tag = await computeSiloedTagForIndex(secrets[0], log1Index);
    const log2Tag = await computeSiloedTagForIndex(secrets[1], log2Index);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(log1Tag)) {
            return [makeLog(Number(finalizedBlockNumber), logBlockTimestamp, log1Tag.value)];
          } else if (t.equals(log2Tag)) {
            return [makeLog(Number(finalizedBlockNumber), logBlockTimestamp, log2Tag.value)];
          }
          return [];
        }),
      );
    });

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
    const [secret] = await makeSecrets(1);
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - 5000n; // not aged

    const logIndex = 5;
    const logTag = await computeSiloedTagForIndex(secret, logIndex);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag) ? [makeLog(Number(finalizedBlockNumber), logBlockTimestamp, logTag.value)] : [],
        ),
      );
    });

    await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, ANCHOR_BLOCK_HEADER, finalizedBlockNumber, JOB_ID);

    expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(logIndex);
    expect(await taggingStore.getHighestAgedIndex(secret, JOB_ID)).toBeUndefined();
  });

  it('updates store correctly when multiple iterations are needed', async () => {
    const [secret] = await makeSecrets(1);
    const finalizedBlockNumber = BlockNumber(10);
    const agedBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    // A log at the last index of the initial window [0, WINDOW_LEN] moves the finalized index to WINDOW_LEN,
    // which shifts the next window forward and triggers a second iteration.
    const lastIndexInInitialWindow = UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN;
    const log1Tag = await computeSiloedTagForIndex(secret, lastIndexInInitialWindow);

    // A second log sits in the advanced window, only reachable in the second iteration.
    const newWindowIndex = lastIndexInInitialWindow + 3;
    const log2Tag = await computeSiloedTagForIndex(secret, newWindowIndex);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(log1Tag)) {
            return [makeLog(Number(finalizedBlockNumber), agedBlockTimestamp, log1Tag.value)];
          } else if (t.equals(log2Tag)) {
            return [makeLog(Number(finalizedBlockNumber), agedBlockTimestamp, log2Tag.value)];
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

    expect(logs).toHaveLength(2);
    expect(await taggingStore.getHighestAgedIndex(secret, JOB_ID)).toBe(newWindowIndex);
    expect(await taggingStore.getHighestFinalizedIndex(secret, JOB_ID)).toBe(newWindowIndex);
  });

  it('respects pre-existing store indexes', async () => {
    const [secret] = await makeSecrets(1);
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
    const [secret] = await makeSecrets(1);
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

  it('filters out logs from blocks after the anchor block', async () => {
    const [secret] = await makeSecrets(1);
    const anchorBlock = BlockNumber(10);
    const header = BlockHeader.random({ blockNumber: anchorBlock, timestamp: CURRENT_TIMESTAMP });
    const finalizedBlockNumber = BlockNumber(10);
    const logBlockTimestamp = CURRENT_TIMESTAMP - BigInt(MAX_TX_LIFETIME) - 1000n;

    const logIndex = 3;
    const logTag = await computeSiloedTagForIndex(secret, logIndex);

    // Three logs: one before anchor, one at anchor, one after anchor
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) =>
          t.equals(logTag)
            ? [
                makeLog(Number(anchorBlock) - 1, logBlockTimestamp, logTag.value),
                makeLog(Number(anchorBlock), logBlockTimestamp, logTag.value),
                makeLog(Number(anchorBlock) + 1, logBlockTimestamp, logTag.value),
              ]
            : [],
        ),
      );
    });

    const logs = await syncTaggedPrivateLogs([secret], aztecNode, taggingStore, header, finalizedBlockNumber, JOB_ID);

    // Only logs at or before the anchor block should be included
    expect(logs).toHaveLength(2);
  });
});

function makeSecrets(count: number): Promise<AppTaggingSecret[]> {
  return Promise.all(Array.from({ length: count }, () => randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED)));
}
