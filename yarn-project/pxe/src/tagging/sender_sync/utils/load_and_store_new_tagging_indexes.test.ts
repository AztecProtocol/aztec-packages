import type { Fr } from '@aztec/foundation/curves/bn254';
import { BlockHash } from '@aztec/stdlib/block';
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
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { SenderTaggingStore } from '../../../storage/tagging_store/sender_tagging_store.js';
import { loadAndStoreNewTaggingIndexes } from './load_and_store_new_tagging_indexes.js';

const MOCK_ANCHOR_BLOCK_HASH = BlockHash.random();

describe('loadAndStoreNewTaggingIndexes', () => {
  let secret: AppTaggingSecret;
  let aztecNode: MockProxy<AztecNode>;
  let taggingStore: MockProxy<SenderTaggingStore>;

  function computeSiloedTagForIndex(index: number) {
    return SiloedTag.compute({ extendedSecret: secret, index });
  }

  function makeLog(txHash: TxHash, _tag: Fr) {
    return { ...randomLogResult(), txHash };
  }

  /**
   * Extracts the bare-tag set from a query, defaulting `afterLog`-wrapped entries to their inner tag. Sender sync
   * never paginates within a tag (one log per index), so the bare-tag path is the only one exercised here.
   */
  function extractTags(query: PrivateLogsQuery): SiloedTag[] {
    return query.tags.map((entry: TagQuery<SiloedTag>) => (entry instanceof SiloedTag ? entry : entry.tag));
  }

  beforeAll(async () => {
    secret = await randomAppTaggingSecret(AppTaggingSecretKind.UNCONSTRAINED);
  });

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
    taggingStore = mock<SenderTaggingStore>();
  });

  it('no logs found for the given window', async () => {
    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(tags.map(() => []));
    });

    await loadAndStoreNewTaggingIndexes(secret, 0, 10, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(taggingStore.mergePendingIndexes).not.toHaveBeenCalled();
  });

  it('single log found at a specific index', async () => {
    const txHash = TxHash.random();
    const index = 5;
    const tag = await computeSiloedTagForIndex(index);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(tags.map((t: SiloedTag) => (t.equals(tag) ? [makeLog(txHash, tag.value)] : [])));
    });

    await loadAndStoreNewTaggingIndexes(secret, 0, 10, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledTimes(1);
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: index, highestIndex: index }],
      txHash,
      'test',
    );
  });

  it('for multiple logs with same txHash stores full index range', async () => {
    const txHash = TxHash.random();
    const index1 = 3;
    const index2 = 7;
    const tag1 = await computeSiloedTagForIndex(index1);
    const tag2 = await computeSiloedTagForIndex(index2);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(tag1)) {
            return [makeLog(txHash, tag1.value)];
          } else if (t.equals(tag2)) {
            return [makeLog(txHash, tag2.value)];
          }
          return [];
        }),
      );
    });

    await loadAndStoreNewTaggingIndexes(secret, 0, 10, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledTimes(1);
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: index1, highestIndex: index2 }],
      txHash,
      'test',
    );
  });

  it('multiple logs with different txHashes', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const index1 = 2;
    const index2 = 6;
    const tag1 = await computeSiloedTagForIndex(index1);
    const tag2 = await computeSiloedTagForIndex(index2);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(tag1)) {
            return [makeLog(txHash1, tag1.value)];
          } else if (t.equals(tag2)) {
            return [makeLog(txHash2, tag2.value)];
          }
          return [];
        }),
      );
    });

    await loadAndStoreNewTaggingIndexes(secret, 0, 10, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledTimes(2);
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: index1, highestIndex: index1 }],
      txHash1,
      'test',
    );
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: index2, highestIndex: index2 }],
      txHash2,
      'test',
    );
  });

  // Expected to happen if sending logs from multiple PXEs at a similar time.
  it('multiple logs at the same index', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const index = 4;
    const tag = await computeSiloedTagForIndex(index);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => (t.equals(tag) ? [makeLog(txHash1, tag.value), makeLog(txHash2, tag.value)] : [])),
      );
    });

    await loadAndStoreNewTaggingIndexes(secret, 0, 10, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledTimes(2);
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: index, highestIndex: index }],
      txHash1,
      'test',
    );
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: index, highestIndex: index }],
      txHash2,
      'test',
    );
  });

  it('complex scenario: multiple txHashes with multiple indexes', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const txHash3 = TxHash.random();

    // txHash1 has logs at index 1, 2 and 8 → range [1, 8]
    // txHash2 has logs at index 3 and 5 → range [3, 5]
    // txHash3 has a log at index 9 → range [9, 9]
    const tag1 = await computeSiloedTagForIndex(1);
    const tag2 = await computeSiloedTagForIndex(2);
    const tag3 = await computeSiloedTagForIndex(3);
    const tag5 = await computeSiloedTagForIndex(5);
    const tag8 = await computeSiloedTagForIndex(8);
    const tag9 = await computeSiloedTagForIndex(9);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(tag1)) {
            return [makeLog(txHash1, tag1.value)];
          } else if (t.equals(tag2)) {
            return [makeLog(txHash1, tag1.value)];
          } else if (t.equals(tag3)) {
            return [makeLog(txHash2, tag3.value)];
          } else if (t.equals(tag5)) {
            return [makeLog(txHash2, tag5.value)];
          } else if (t.equals(tag8)) {
            return [makeLog(txHash1, tag8.value)];
          } else if (t.equals(tag9)) {
            return [makeLog(txHash3, tag9.value)];
          }
          return [];
        }),
      );
    });

    await loadAndStoreNewTaggingIndexes(secret, 0, 10, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledTimes(3);
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: 1, highestIndex: 8 }],
      txHash1,
      'test',
    );
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: 3, highestIndex: 5 }],
      txHash2,
      'test',
    );
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: 9, highestIndex: 9 }],
      txHash3,
      'test',
    );
  });

  it('start is inclusive and end is exclusive', async () => {
    const start = 5;
    const end = 10;

    const txHashAtStart = TxHash.random();
    const txHashAtEnd = TxHash.random();

    const tagAtStart = await computeSiloedTagForIndex(start);
    const tagAtEnd = await computeSiloedTagForIndex(end);

    aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
      const tags = extractTags(query);
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(tagAtStart)) {
            return [makeLog(txHashAtStart, tagAtStart.value)];
          } else if (t.equals(tagAtEnd)) {
            return [makeLog(txHashAtEnd, tagAtEnd.value)];
          }
          return [];
        }),
      );
    });

    await loadAndStoreNewTaggingIndexes(secret, start, end, aztecNode, taggingStore, MOCK_ANCHOR_BLOCK_HASH, 'test');

    // Only the log at start should be stored; end is exclusive
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledTimes(1);
    expect(taggingStore.mergePendingIndexes).toHaveBeenCalledWith(
      [{ extendedSecret: secret, lowestIndex: start, highestIndex: start }],
      txHashAtStart,
      'test',
    );
  });
});
