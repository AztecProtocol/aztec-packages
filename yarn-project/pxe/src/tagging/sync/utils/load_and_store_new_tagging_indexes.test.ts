import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DirectionalAppTaggingSecret, PrivateLog, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SenderTaggingDataProvider } from '../../../storage/tagging_data_provider/sender_tagging_data_provider.js';
import { loadAndStoreNewTaggingIndexes } from './load_and_store_new_tagging_indexes.js';

describe('loadAndStoreNewTaggingIndexes', () => {
  // App contract address and secret to be used on the input of the loadAndStoreNewTaggingIndexes function.
  let secret: DirectionalAppTaggingSecret;
  let app: AztecAddress;

  let aztecNode: MockProxy<AztecNode>;
  let taggingDataProvider: SenderTaggingDataProvider;

  async function computeSiloedTagForIndex(index: number) {
    const tag = await Tag.compute({ secret, index });
    return SiloedTag.compute(tag, app);
  }

  function makeLog(txHash: TxHash, tag: Fr) {
    return new TxScopedL2Log(txHash, 0, 0, BlockNumber(0), L2BlockHash.random(), 0n, PrivateLog.random(tag));
  }

  beforeAll(async () => {
    secret = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    app = await AztecAddress.random();
    aztecNode = mock<AztecNode>();
  });

  // Unlike for secret, app address and aztecNode we need a fresh instance of the tagging data provider for each test.
  beforeEach(async () => {
    aztecNode.getPrivateLogsByTags.mockReset();
    taggingDataProvider = new SenderTaggingDataProvider(await openTmpStore('test'));
  });

  it('no logs found for the given window', async () => {
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      // No log found for any tag
      return Promise.resolve(tags.map((_tag: SiloedTag) => []));
    });

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingDataProvider);

    // Verify that no pending indexes were stored
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBeUndefined();
    expect(await taggingDataProvider.getLastFinalizedIndex(secret)).toBeUndefined();

    // Verify the entire window has no pending tx hashes
    const txHashesInWindow = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, 0, 10);
    expect(txHashesInWindow).toHaveLength(0);
  });

  it('single log found at a specific index', async () => {
    const txHash = TxHash.random();
    const index = 5;
    const tag = await computeSiloedTagForIndex(index);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(tags.map((t: SiloedTag) => (t.equals(tag) ? [makeLog(txHash, tag.value)] : [])));
    });

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingDataProvider);

    // Verify that the pending index was stored for this txHash
    const txHashesInRange = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, index, index + 1);
    expect(txHashesInRange).toHaveLength(1);
    expect(txHashesInRange[0].equals(txHash)).toBe(true);

    // Verify the last used index is correct
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(index);
  });

  it('for multiple logs with same txHash stores the highest index', async () => {
    const txHash = TxHash.random();
    const index1 = 3;
    const index2 = 7;
    const tag1 = await computeSiloedTagForIndex(index1);
    const tag2 = await computeSiloedTagForIndex(index2);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingDataProvider);

    // Verify that only the highest index (7) was stored for this txHash and secret
    const txHashesAtIndex2 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, index2, index2 + 1);
    expect(txHashesAtIndex2).toHaveLength(1);
    expect(txHashesAtIndex2[0].equals(txHash)).toBe(true);

    // Verify the lower index is not stored separately
    const txHashesAtIndex1 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, index1, index1 + 1);
    expect(txHashesAtIndex1).toHaveLength(0);

    // Verify the last used index is the highest
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(index2);
  });

  it('multiple logs with different txHashes', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const index1 = 2;
    const index2 = 6;
    const tag1 = await computeSiloedTagForIndex(index1);
    const tag2 = await computeSiloedTagForIndex(index2);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingDataProvider);

    // Verify that both txHashes have their respective indexes stored
    const txHashesAtIndex1 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, index1, index1 + 1);
    expect(txHashesAtIndex1).toHaveLength(1);
    expect(txHashesAtIndex1[0].equals(txHash1)).toBe(true);

    const txHashesAtIndex2 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, index2, index2 + 1);
    expect(txHashesAtIndex2).toHaveLength(1);
    expect(txHashesAtIndex2[0].equals(txHash2)).toBe(true);

    // Verify the last used index is the highest
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(index2);
  });

  // Expected to happen if sending logs from multiple PXEs at a similar time.
  it('multiple logs at the same index', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const index = 4;
    const tag = await computeSiloedTagForIndex(index);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(
        tags.map((t: SiloedTag) => (t.equals(tag) ? [makeLog(txHash1, tag.value), makeLog(txHash2, tag.value)] : [])),
      );
    });

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingDataProvider);

    // Verify that both txHashes have the same index stored
    const txHashesAtIndex = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, index, index + 1);
    expect(txHashesAtIndex).toHaveLength(2);
    const txHashStrings = txHashesAtIndex.map(h => h.toString());
    expect(txHashStrings).toContain(txHash1.toString());
    expect(txHashStrings).toContain(txHash2.toString());

    // Verify the last used index is correct
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(index);
  });

  it('complex scenario: multiple txHashes with multiple indexes', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const txHash3 = TxHash.random();

    // txHash1 has logs at index 1 and 8 (should store 8)
    // txHash2 has logs at index 3 and 5 (should store 5)
    // txHash3 has a log at index 9 (should store 9)
    const tag1 = await computeSiloedTagForIndex(1);
    const tag3 = await computeSiloedTagForIndex(3);
    const tag5 = await computeSiloedTagForIndex(5);
    const tag8 = await computeSiloedTagForIndex(8);
    const tag9 = await computeSiloedTagForIndex(9);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(
        tags.map((t: SiloedTag) => {
          if (t.equals(tag1)) {
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingDataProvider);

    // Verify txHash1 has highest index 8 (should not be at index 1)
    const txHashesAtIndex1 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, 1, 2);
    expect(txHashesAtIndex1).toHaveLength(0);
    const txHashesAtIndex8 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, 8, 9);
    expect(txHashesAtIndex8).toHaveLength(1);
    expect(txHashesAtIndex8[0].equals(txHash1)).toBe(true);

    // Verify txHash2 has highest index 5 (should not be at index 3)
    const txHashesAtIndex3 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, 3, 4);
    expect(txHashesAtIndex3).toHaveLength(0);
    const txHashesAtIndex5 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, 5, 6);
    expect(txHashesAtIndex5).toHaveLength(1);
    expect(txHashesAtIndex5[0].equals(txHash2)).toBe(true);

    // Verify txHash3 has index 9
    const txHashesAtIndex9 = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, 9, 10);
    expect(txHashesAtIndex9).toHaveLength(1);
    expect(txHashesAtIndex9[0].equals(txHash3)).toBe(true);

    // Verify the last used index is the highest
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(9);
  });

  it('start is inclusive and end is exclusive', async () => {
    const start = 5;
    const end = 10;

    const txHashAtStart = TxHash.random();
    const txHashAtEnd = TxHash.random();

    const tagAtStart = await computeSiloedTagForIndex(start);
    const tagAtEnd = await computeSiloedTagForIndex(end);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
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

    await loadAndStoreNewTaggingIndexes(secret, app, start, end, aztecNode, taggingDataProvider);

    // Verify that the log at start (inclusive) was processed
    const txHashesAtStart = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, start, start + 1);
    expect(txHashesAtStart).toHaveLength(1);
    expect(txHashesAtStart[0].equals(txHashAtStart)).toBe(true);

    // Verify that the log at end (exclusive) was NOT processed
    const txHashesAtEnd = await taggingDataProvider.getTxHashesOfPendingIndexes(secret, end, end + 1);
    expect(txHashesAtEnd).toHaveLength(0);

    // Verify the last used index is the start index (since end was not processed)
    expect(await taggingDataProvider.getLastUsedIndex(secret)).toBe(start);
  });
});
