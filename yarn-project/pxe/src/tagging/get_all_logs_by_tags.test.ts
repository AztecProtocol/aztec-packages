import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG } from '@aztec/stdlib/interfaces/api-limit';
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
});
