import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { SiloedTag, Tag } from '@aztec/stdlib/logs';
import { randomTxScopedPrivateL2Log } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getAllPrivateLogsByTags } from './get_all_logs_by_tags.js';

// We don't bother testing getAllPublicLogsByTagsFromContract because both of the functions are a simple wrapper around
// getAllPages function so just testing the private logs function is enough.

const MOCK_ANCHOR_BLOCK_HASH = BlockHash.random();

describe('getAllPrivateLogsByTags', () => {
  let aztecNode: MockProxy<AztecNode>;
  let tags: SiloedTag[];

  beforeAll(async () => {
    tags = await Promise.all(
      [1, 2, 3].map(async () => SiloedTag.compute(new Tag(Fr.random()), await AztecAddress.random())),
    );
  });

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
  });

  it('returns empty arrays when no logs found', async () => {
    aztecNode.getPrivateLogsByTags.mockResolvedValue(tags.map(() => []));

    const result = await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR_BLOCK_HASH);

    expect(result).toEqual([[], [], []]);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledWith(tags, 0, MOCK_ANCHOR_BLOCK_HASH);
  });

  it('returns logs when all fit in a single page', async () => {
    const logsPerTag = tags.map((tag, i) => Array(i + 1).fill(randomTxScopedPrivateL2Log({ tag: tag.value })));
    aztecNode.getPrivateLogsByTags.mockResolvedValue(logsPerTag);

    const result = await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR_BLOCK_HASH);

    expect(result.map(logs => logs.length)).toEqual([1, 2, 3]);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('paginates when any tag has MAX_LOGS_PER_TAG logs', async () => {
    const firstPage = [
      Array(MAX_LOGS_PER_TAG).fill(randomTxScopedPrivateL2Log({ tag: tags[0].value })),
      [randomTxScopedPrivateL2Log({ tag: tags[1].value })],
      [],
    ];
    const secondPage = [Array(5).fill(randomTxScopedPrivateL2Log({ tag: tags[0].value })), [], []];

    aztecNode.getPrivateLogsByTags.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const result = await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR_BLOCK_HASH);

    expect(result.map(logs => logs.length)).toEqual([MAX_LOGS_PER_TAG + 5, 1, 0]);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(1, tags, 0, MOCK_ANCHOR_BLOCK_HASH);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(2, tags, 1, MOCK_ANCHOR_BLOCK_HASH);
  });

  it('handles empty tags array', async () => {
    aztecNode.getPrivateLogsByTags.mockResolvedValue([]);

    const result = await getAllPrivateLogsByTags(aztecNode, [], MOCK_ANCHOR_BLOCK_HASH);

    expect(result).toEqual([]);
  });

  describe('batching when tags exceed MAX_RPC_LEN', () => {
    let manyTags: SiloedTag[];

    beforeAll(async () => {
      manyTags = await Promise.all(Array.from({ length: MAX_RPC_LEN + 50 }, () => new SiloedTag(Fr.random())));
    });

    it('splits tags into batches and concatenates results', async () => {
      const batch1Tags = manyTags.slice(0, MAX_RPC_LEN);
      const batch2Tags = manyTags.slice(MAX_RPC_LEN);

      aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
        return Promise.resolve(tags.map(tag => [randomTxScopedPrivateL2Log({ tag: tag.value })]));
      });

      const result = await getAllPrivateLogsByTags(aztecNode, manyTags, MOCK_ANCHOR_BLOCK_HASH);

      expect(result).toHaveLength(MAX_RPC_LEN + 50);
      expect(result.every(logs => logs.length === 1)).toBe(true);

      // Should have been called twice: once per batch
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(1, batch1Tags, 0, MOCK_ANCHOR_BLOCK_HASH);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(2, batch2Tags, 0, MOCK_ANCHOR_BLOCK_HASH);
    });

    it('paginates within each batch', async () => {
      aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[], page: number) => {
        if (tags.length === MAX_RPC_LEN && page === 0) {
          // First batch, first page: first tag has MAX_LOGS_PER_TAG logs (triggers pagination)
          return Promise.resolve(
            tags.map((tag, i) =>
              i === 0
                ? Array(MAX_LOGS_PER_TAG).fill(randomTxScopedPrivateL2Log({ tag: tag.value }))
                : [randomTxScopedPrivateL2Log({ tag: tag.value })],
            ),
          );
        }
        if (tags.length === MAX_RPC_LEN && page === 1) {
          // First batch, second page: 3 more logs for first tag
          return Promise.resolve(
            tags.map((tag, i) => (i === 0 ? Array(3).fill(randomTxScopedPrivateL2Log({ tag: tag.value })) : [])),
          );
        }
        // Second batch (50 tags), single page
        return Promise.resolve(tags.map(tag => [randomTxScopedPrivateL2Log({ tag: tag.value })]));
      });

      const result = await getAllPrivateLogsByTags(aztecNode, manyTags, MOCK_ANCHOR_BLOCK_HASH);

      expect(result).toHaveLength(MAX_RPC_LEN + 50);
      // First tag in batch 1 got paginated: MAX_LOGS_PER_TAG + 3
      expect(result[0]).toHaveLength(MAX_LOGS_PER_TAG + 3);
      // Other tags in batch 1 got 1 log each
      expect(result[1]).toHaveLength(1);
      // Tags in batch 2 got 1 log each
      expect(result[MAX_RPC_LEN]).toHaveLength(1);

      // 2 pages for first batch + 1 page for second batch = 3 calls
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(3);
    });

    it('does not batch when tags fit within MAX_RPC_LEN', async () => {
      const exactlyMaxTags = manyTags.slice(0, MAX_RPC_LEN);

      aztecNode.getPrivateLogsByTags.mockResolvedValue(exactlyMaxTags.map(() => []));

      const result = await getAllPrivateLogsByTags(aztecNode, exactlyMaxTags, MOCK_ANCHOR_BLOCK_HASH);

      expect(result).toHaveLength(MAX_RPC_LEN);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledWith(exactlyMaxTags, 0, MOCK_ANCHOR_BLOCK_HASH);
    });
  });
});
