import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DirectionalAppTaggingSecret, SiloedTag, Tag } from '@aztec/stdlib/logs';
import { randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { SenderTaggingStore } from '../../../storage/tagging_store/sender_tagging_store.js';
import { loadAndStoreNewTaggingIndexes } from './load_and_store_new_tagging_indexes.js';

const TEST_JOB_ID = 'test-job';

describe('loadAndStoreNewTaggingIndexes', () => {
  // App contract address and secret to be used on the input of the loadAndStoreNewTaggingIndexes function.
  let secret: DirectionalAppTaggingSecret;
  let app: AztecAddress;

  let aztecNode: MockProxy<AztecNode>;
  let taggingStore: SenderTaggingStore;

  async function computeSiloedTagForIndex(index: number) {
    const tag = await Tag.compute({ secret, index });
    return SiloedTag.compute(tag, app);
  }

  function makeLog(txHash: TxHash, tag: Fr) {
    return randomTxScopedPrivateL2Log({ txHash, tag });
  }

  beforeAll(async () => {
    secret = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    app = await AztecAddress.random();
    aztecNode = mock<AztecNode>();
  });

  // Unlike for secret, app address and aztecNode we need a fresh instance of the tagging data provider for each test.
  beforeEach(async () => {
    aztecNode.getPrivateLogsByTags.mockReset();
    taggingStore = new SenderTaggingStore(await openTmpStore('test'));
  });

  it('no logs found for the given window', async () => {
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      // No log found for any tag
      return Promise.resolve(tags.map((_tag: SiloedTag) => []));
    });

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify that no pending indexes were stored
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBeUndefined();
    expect(await taggingStore.getLastFinalizedIndex(secret, TEST_JOB_ID)).toBeUndefined();

    // Verify the entire window has no pending tx hashes
    const txHashesInWindow = await taggingStore.getTxHashesOfPendingIndexes(secret, 0, 10, TEST_JOB_ID);
    expect(txHashesInWindow).toHaveLength(0);
  });

  it('single log found at a specific index', async () => {
    const txHash = TxHash.random();
    const index = 5;
    const tag = await computeSiloedTagForIndex(index);

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.resolve(tags.map((t: SiloedTag) => (t.equals(tag) ? [makeLog(txHash, tag.value)] : [])));
    });

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify that the pending index was stored for this txHash
    const txHashesInRange = await taggingStore.getTxHashesOfPendingIndexes(secret, index, index + 1, TEST_JOB_ID);
    expect(txHashesInRange).toHaveLength(1);
    expect(txHashesInRange[0].equals(txHash)).toBe(true);

    // Verify the last used index is correct
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBe(index);
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify that only the highest index (7) was stored for this txHash and secret
    const txHashesAtIndex2 = await taggingStore.getTxHashesOfPendingIndexes(secret, index2, index2 + 1, TEST_JOB_ID);
    expect(txHashesAtIndex2).toHaveLength(1);
    expect(txHashesAtIndex2[0].equals(txHash)).toBe(true);

    // Verify the lower index is not stored separately
    const txHashesAtIndex1 = await taggingStore.getTxHashesOfPendingIndexes(secret, index1, index1 + 1, TEST_JOB_ID);
    expect(txHashesAtIndex1).toHaveLength(0);

    // Verify the last used index is the highest
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBe(index2);
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify that both txHashes have their respective indexes stored
    const txHashesAtIndex1 = await taggingStore.getTxHashesOfPendingIndexes(secret, index1, index1 + 1, TEST_JOB_ID);
    expect(txHashesAtIndex1).toHaveLength(1);
    expect(txHashesAtIndex1[0].equals(txHash1)).toBe(true);

    const txHashesAtIndex2 = await taggingStore.getTxHashesOfPendingIndexes(secret, index2, index2 + 1, TEST_JOB_ID);
    expect(txHashesAtIndex2).toHaveLength(1);
    expect(txHashesAtIndex2[0].equals(txHash2)).toBe(true);

    // Verify the last used index is the highest
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBe(index2);
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify that both txHashes have the same index stored
    const txHashesAtIndex = await taggingStore.getTxHashesOfPendingIndexes(secret, index, index + 1, TEST_JOB_ID);
    expect(txHashesAtIndex).toHaveLength(2);
    const txHashStrings = txHashesAtIndex.map(h => h.toString());
    expect(txHashStrings).toContain(txHash1.toString());
    expect(txHashStrings).toContain(txHash2.toString());

    // Verify the last used index is correct
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBe(index);
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

    await loadAndStoreNewTaggingIndexes(secret, app, 0, 10, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify txHash1 has highest index 8 (should not be at index 1)
    const txHashesAtIndex1 = await taggingStore.getTxHashesOfPendingIndexes(secret, 1, 2, TEST_JOB_ID);
    expect(txHashesAtIndex1).toHaveLength(0);
    const txHashesAtIndex8 = await taggingStore.getTxHashesOfPendingIndexes(secret, 8, 9, TEST_JOB_ID);
    expect(txHashesAtIndex8).toHaveLength(1);
    expect(txHashesAtIndex8[0].equals(txHash1)).toBe(true);

    // Verify txHash2 has highest index 5 (should not be at index 3)
    const txHashesAtIndex3 = await taggingStore.getTxHashesOfPendingIndexes(secret, 3, 4, TEST_JOB_ID);
    expect(txHashesAtIndex3).toHaveLength(0);
    const txHashesAtIndex5 = await taggingStore.getTxHashesOfPendingIndexes(secret, 5, 6, TEST_JOB_ID);
    expect(txHashesAtIndex5).toHaveLength(1);
    expect(txHashesAtIndex5[0].equals(txHash2)).toBe(true);

    // Verify txHash3 has index 9
    const txHashesAtIndex9 = await taggingStore.getTxHashesOfPendingIndexes(secret, 9, 10, TEST_JOB_ID);
    expect(txHashesAtIndex9).toHaveLength(1);
    expect(txHashesAtIndex9[0].equals(txHash3)).toBe(true);

    // Verify the last used index is the highest
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBe(9);
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

    await loadAndStoreNewTaggingIndexes(secret, app, start, end, aztecNode, taggingStore, TEST_JOB_ID);

    // Verify that the log at start (inclusive) was processed
    const txHashesAtStart = await taggingStore.getTxHashesOfPendingIndexes(secret, start, start + 1, TEST_JOB_ID);
    expect(txHashesAtStart).toHaveLength(1);
    expect(txHashesAtStart[0].equals(txHashAtStart)).toBe(true);

    // Verify that the log at end (exclusive) was NOT processed
    const txHashesAtEnd = await taggingStore.getTxHashesOfPendingIndexes(secret, end, end + 1, TEST_JOB_ID);
    expect(txHashesAtEnd).toHaveLength(0);

    // Verify the last used index is the start index (since end was not processed)
    expect(await taggingStore.getLastUsedIndex(secret, TEST_JOB_ID)).toBe(start);
  });
});
