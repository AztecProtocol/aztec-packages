import { BlockNumber } from '@aztec/foundation/branded-types';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { MAX_LOGS_PER_TAG, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/api-limit';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { LogCursor, type LogResult, type PrivateLogsQuery, SiloedTag, Tag, randomLogResult } from '@aztec/stdlib/logs';

import { type MockProxy, mock } from 'jest-mock-extended';

import { getAllPrivateLogsByTags } from './get_all_logs_by_tags.js';

// We don't bother testing getAllPublicLogsByTagsFromContract because both of the functions are a simple wrapper around
// the same per-tag pagination loop, so testing the private logs function is enough.

const MOCK_ANCHOR = { hash: BlockHash.random(), number: BlockNumber(100) };

/** Builds a log with a stable blockNumber/logIndexWithinTx so we can assert cursor wiring. */
function makeLog({ blockNumber = 1, logIndexWithinTx = 0 }: { blockNumber?: number; logIndexWithinTx?: number } = {}) {
  return { ...randomLogResult(), blockNumber: BlockNumber(blockNumber), logIndexWithinTx };
}

/** Convenience: build a same-length array of cloned logs that share a cursor target (the last one). */
function fillPage(size: number, lastLog: LogResult): LogResult[] {
  const filler = Array.from({ length: size - 1 }, (_, i) => makeLog({ logIndexWithinTx: i }));
  return [...filler, lastLog];
}

describe('getAllPrivateLogsByTags', () => {
  let aztecNode: MockProxy<AztecNode>;
  let tags: SiloedTag[];

  beforeAll(async () => {
    tags = await Promise.all(
      [1, 2, 3].map(async () => SiloedTag.computeFromTagAndApp(Tag.random(), await AztecAddress.random())),
    );
  });

  beforeEach(() => {
    aztecNode = mock<AztecNode>();
  });

  it('returns empty arrays when no logs found', async () => {
    aztecNode.getPrivateLogsByTags.mockResolvedValue(tags.map(() => []));

    const result = await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR);

    expect(result).toEqual([[], [], []]);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledWith({
      tags,
      referenceBlock: MOCK_ANCHOR.hash,
      fromBlock: undefined,
      toBlock: BlockNumber(101),
      includeEffects: false,
    } satisfies PrivateLogsQuery);
  });

  it('returns logs when all fit in a single page', async () => {
    const logsPerTag = tags.map((_tag, i) => Array.from({ length: i + 1 }, () => makeLog()));
    aztecNode.getPrivateLogsByTags.mockResolvedValue(logsPerTag);

    const result = await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR);

    expect(result.map(logs => logs.length)).toEqual([1, 2, 3]);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(1);
  });

  it('paginates only tags that returned a full page, using their afterLog cursor', async () => {
    const lastLogOfFirstPage = makeLog({ blockNumber: 42, logIndexWithinTx: 9 });
    const firstPage = [fillPage(MAX_LOGS_PER_TAG, lastLogOfFirstPage), [makeLog()], []];
    const secondPage = [Array.from({ length: 5 }, () => makeLog())];

    aztecNode.getPrivateLogsByTags.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);

    const result = await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR);

    expect(result.map(logs => logs.length)).toEqual([MAX_LOGS_PER_TAG + 5, 1, 0]);
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);

    // Round 1: all tags queried with bare tags
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(1, {
      tags,
      referenceBlock: MOCK_ANCHOR.hash,
      fromBlock: undefined,
      toBlock: BlockNumber(101),
      includeEffects: false,
    });

    // Round 2: only tag[0] re-queried, with an afterLog cursor pointing at the last log of round 1
    expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(2, {
      tags: [{ tag: tags[0], afterLog: LogCursor.fromLog(lastLogOfFirstPage) }],
      referenceBlock: MOCK_ANCHOR.hash,
      fromBlock: undefined,
      toBlock: BlockNumber(101),
      includeEffects: false,
    });
  });

  it('handles empty tags array', async () => {
    aztecNode.getPrivateLogsByTags.mockResolvedValue([]);

    const result = await getAllPrivateLogsByTags(aztecNode, [], MOCK_ANCHOR);

    expect(result).toEqual([]);
    expect(aztecNode.getPrivateLogsByTags).not.toHaveBeenCalled();
  });

  it('forwards options (fromBlock/toBlock/includeEffects/limitPerTag) to the node', async () => {
    aztecNode.getPrivateLogsByTags.mockResolvedValue(tags.map(() => []));

    await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR, {
      fromBlock: BlockNumber(5),
      toBlock: BlockNumber(10),
      includeEffects: true,
      limitPerTag: 3,
    });

    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledWith({
      tags,
      referenceBlock: MOCK_ANCHOR.hash,
      fromBlock: BlockNumber(5),
      toBlock: BlockNumber(10),
      includeEffects: true,
      limitPerTag: 3,
    });
  });

  it('narrows a toBlock that reaches past the anchor block', async () => {
    aztecNode.getPrivateLogsByTags.mockResolvedValue(tags.map(() => []));

    await getAllPrivateLogsByTags(aztecNode, tags, MOCK_ANCHOR, { toBlock: BlockNumber(500) });

    expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledWith(expect.objectContaining({ toBlock: BlockNumber(101) }));
  });

  describe('batching when tags exceed MAX_RPC_LEN', () => {
    let manyTags: SiloedTag[];

    beforeAll(async () => {
      manyTags = await Promise.all(Array.from({ length: MAX_RPC_LEN + 50 }, () => SiloedTag.random()));
    });

    it('splits tags into batches and concatenates results', async () => {
      const batch1Tags = manyTags.slice(0, MAX_RPC_LEN);
      const batch2Tags = manyTags.slice(MAX_RPC_LEN);

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
        return Promise.resolve(query.tags.map(() => [makeLog()]));
      });

      const result = await getAllPrivateLogsByTags(aztecNode, manyTags, MOCK_ANCHOR);

      expect(result).toHaveLength(MAX_RPC_LEN + 50);
      expect(result.every(logs => logs.length === 1)).toBe(true);

      // Should have been called twice: once per batch
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(2);
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(1, {
        tags: batch1Tags,
        referenceBlock: MOCK_ANCHOR.hash,
        fromBlock: undefined,
        toBlock: BlockNumber(101),
        includeEffects: false,
      });
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenNthCalledWith(2, {
        tags: batch2Tags,
        referenceBlock: MOCK_ANCHOR.hash,
        fromBlock: undefined,
        toBlock: BlockNumber(101),
        includeEffects: false,
      });
    });

    it('paginates within each batch and only re-queries tags with a full page', async () => {
      const lastLog = makeLog({ blockNumber: 99, logIndexWithinTx: 9 });

      aztecNode.getPrivateLogsByTags.mockImplementation((query: PrivateLogsQuery) => {
        // First batch (MAX_RPC_LEN tags), round 1: index 0 returns a full page (last log pinned to `lastLog`),
        // every other tag returns a single log.
        if (query.tags.length === MAX_RPC_LEN) {
          return Promise.resolve(
            query.tags.map((_t: unknown, i: number) => (i === 0 ? fillPage(MAX_LOGS_PER_TAG, lastLog) : [makeLog()])),
          );
        }
        // First batch, round 2: only tag[0] is re-queried with afterLog cursor.
        if (query.tags.length === 1) {
          const tagEntry = query.tags[0];
          expect(typeof tagEntry).toBe('object');
          expect((tagEntry as { afterLog: LogCursor }).afterLog.equals(LogCursor.fromLog(lastLog))).toBe(true);
          return Promise.resolve([Array.from({ length: 3 }, () => makeLog())]);
        }
        // Second batch (50 tags), single round
        return Promise.resolve(query.tags.map(() => [makeLog()]));
      });

      const result = await getAllPrivateLogsByTags(aztecNode, manyTags, MOCK_ANCHOR);

      expect(result).toHaveLength(MAX_RPC_LEN + 50);
      // First tag in batch 1 got paginated: MAX_LOGS_PER_TAG + 3
      expect(result[0]).toHaveLength(MAX_LOGS_PER_TAG + 3);
      // Other tags in batch 1 got 1 log each
      expect(result[1]).toHaveLength(1);
      // Tags in batch 2 got 1 log each
      expect(result[MAX_RPC_LEN]).toHaveLength(1);

      // 2 rounds for first batch + 1 round for second batch = 3 calls
      expect(aztecNode.getPrivateLogsByTags).toHaveBeenCalledTimes(3);
    });
  });
});
