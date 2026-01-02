import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { L2BlockHash } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DirectionalAppTaggingSecret, PrivateLog, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import { makeBlockHeader } from '@aztec/stdlib/testing';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { loadLogsForRange } from './load_logs_for_range.js';

// In tests where the anchor block behavior is not under examination, we use a high block number to ensure it occurs
// after all logs.
const NON_INTERFERING_ANCHOR_BLOCK_NUMBER = BlockNumber(100);

describe('loadLogsForRange', () => {
  // App contract address and secret to be used on the input of the loadLogsForRange function.
  let secret: DirectionalAppTaggingSecret;
  let app: AztecAddress;

  let aztecNode: MockProxy<AztecNode>;

  async function computeSiloedTagForIndex(index: number) {
    const tag = await Tag.compute({ secret, index });
    return SiloedTag.compute(tag, app);
  }

  function makeLog(txHash: TxHash, blockHash: Fr, blockNumber: number, blockTimestamp: bigint, tag: SiloedTag) {
    return new TxScopedL2Log(
      txHash,
      0,
      0,
      BlockNumber(blockNumber),
      L2BlockHash.fromField(blockHash),
      blockTimestamp,
      PrivateLog.random(tag.value),
    );
  }

  beforeAll(async () => {
    secret = DirectionalAppTaggingSecret.fromString(Fr.random().toString());
    app = await AztecAddress.random();
    aztecNode = mock<AztecNode>();
  });

  beforeEach(() => {
    aztecNode.getPrivateLogsByTags.mockReset();
  });

  it('returns empty array when no logs found for the given window', async () => {
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      // No log found for any tag
      return Promise.resolve(tags.map((_tag: SiloedTag) => []));
    });

    expect(await loadLogsForRange(secret, app, aztecNode, 0, 10, NON_INTERFERING_ANCHOR_BLOCK_NUMBER)).toHaveLength(0);
  });

  it('handles multiple logs at different indexes', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const blockNumber1 = 5;
    const blockNumber2 = 6;
    const index1 = 2;
    const index2 = 7;
    const timestamp1 = 1000n;
    const timestamp2 = 2000n;
    const tag1 = await computeSiloedTagForIndex(index1);
    const tag2 = await computeSiloedTagForIndex(index2);
    const blockHeader1 = makeBlockHeader(0, { timestamp: timestamp1 });
    const blockHeader2 = makeBlockHeader(1, { timestamp: timestamp2 });

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.all(
        tags.map(async (t: SiloedTag) => {
          if (t.equals(tag1)) {
            return [makeLog(txHash1, await blockHeader1.hash(), blockNumber1, timestamp1, tag1)];
          } else if (t.equals(tag2)) {
            return [makeLog(txHash2, await blockHeader2.hash(), blockNumber2, timestamp2, tag2)];
          }
          return [];
        }),
      );
    });

    const result = await loadLogsForRange(secret, app, aztecNode, 0, 10, NON_INTERFERING_ANCHOR_BLOCK_NUMBER);

    expect(result).toHaveLength(2);
    const resultByIndex = result.sort((a, b) => a.taggingIndex - b.taggingIndex);
    expect(resultByIndex[0].taggingIndex).toBe(index1);
    expect(resultByIndex[0].log.blockTimestamp).toBe(timestamp1);
    expect(resultByIndex[0].log.txHash.equals(txHash1)).toBe(true);
    expect(resultByIndex[1].taggingIndex).toBe(index2);
    expect(resultByIndex[1].log.blockTimestamp).toBe(timestamp2);
    expect(resultByIndex[1].log.txHash.equals(txHash2)).toBe(true);
  });

  it('handles multiple logs at the same index', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const blockNumber1 = 5;
    const blockNumber2 = 6;
    const index = 4;
    const timestamp1 = 1000n;
    const timestamp2 = 2000n;
    const tag = await computeSiloedTagForIndex(index);
    const blockHeader1 = makeBlockHeader(0, { timestamp: timestamp1 });
    const blockHeader2 = makeBlockHeader(1, { timestamp: timestamp2 });

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.all(
        tags.map(async (t: SiloedTag) =>
          t.equals(tag)
            ? [
                makeLog(txHash1, await blockHeader1.hash(), blockNumber1, timestamp1, tag),
                makeLog(txHash2, await blockHeader2.hash(), blockNumber2, timestamp2, tag),
              ]
            : [],
        ),
      );
    });

    const result = await loadLogsForRange(secret, app, aztecNode, 0, 10, NON_INTERFERING_ANCHOR_BLOCK_NUMBER);

    expect(result).toHaveLength(2);
    expect(result[0].taggingIndex).toBe(index);
    expect(result[1].taggingIndex).toBe(index);
    const txHashes = result.map(r => r.log.txHash.toString());
    expect(txHashes).toContain(txHash1.toString());
    expect(txHashes).toContain(txHash2.toString());
  });

  it('handles multiple logs in the same block', async () => {
    const txHash1 = TxHash.random();
    const txHash2 = TxHash.random();
    const blockNumber = 5;
    const index1 = 2;
    const index2 = 3;
    const timestamp = 1000n;
    const tag1 = await computeSiloedTagForIndex(index1);
    const tag2 = await computeSiloedTagForIndex(index2);
    const blockHeader = makeBlockHeader(0, { timestamp });

    aztecNode.getPrivateLogsByTags.mockImplementation(async (tags: SiloedTag[]) => {
      const blockHash = await blockHeader.hash();
      return tags.map((t: SiloedTag) => {
        if (t.equals(tag1)) {
          return [makeLog(txHash1, blockHash, blockNumber, timestamp, tag1)];
        } else if (t.equals(tag2)) {
          return [makeLog(txHash2, blockHash, blockNumber, timestamp, tag2)];
        }
        return [];
      });
    });

    const result = await loadLogsForRange(secret, app, aztecNode, 0, 10, NON_INTERFERING_ANCHOR_BLOCK_NUMBER);

    expect(result).toHaveLength(2);

    const resultByIndex = result.sort((a, b) => a.taggingIndex - b.taggingIndex);
    expect(resultByIndex[0].taggingIndex).toBe(index1);
    expect(resultByIndex[0].log.blockTimestamp).toBe(timestamp);
    expect(resultByIndex[1].taggingIndex).toBe(index2);
    expect(resultByIndex[1].log.blockTimestamp).toBe(timestamp);
  });

  it('respects start (inclusive) and end (exclusive) boundaries', async () => {
    const start = 5;
    const end = 10;

    const txHashAtStart = TxHash.random();
    const txHashAtEnd = TxHash.random();
    const timestamp = 1000n;
    const tagAtStart = await computeSiloedTagForIndex(start);
    const tagAtEnd = await computeSiloedTagForIndex(end);
    const blockHeader = makeBlockHeader(0, { timestamp });

    aztecNode.getPrivateLogsByTags.mockImplementation(async (tags: SiloedTag[]) => {
      const blockHash = await blockHeader.hash();
      return tags.map((t: SiloedTag) => {
        if (t.equals(tagAtStart)) {
          return [makeLog(txHashAtStart, blockHash, 5, timestamp, tagAtStart)];
        } else if (t.equals(tagAtEnd)) {
          return [makeLog(txHashAtEnd, blockHash, 6, timestamp, tagAtEnd)];
        }
        return [];
      });
    });

    const result = await loadLogsForRange(secret, app, aztecNode, start, end, NON_INTERFERING_ANCHOR_BLOCK_NUMBER);

    // Should only include log at start (inclusive), not at end (exclusive)
    expect(result).toHaveLength(1);
    expect(result[0].taggingIndex).toBe(start);
    expect(result[0].log.txHash.equals(txHashAtStart)).toBe(true);
  });

  it('filters out logs from blocks after anchor block', async () => {
    const anchorBlockNumber = 10;

    const index = 3;
    const timestamp = 1000n;
    const tag = await computeSiloedTagForIndex(index);
    const blockHeaderBefore = makeBlockHeader(0, { timestamp });
    const blockHeaderAtAnchor = makeBlockHeader(1, { timestamp });
    const blockHeaderAfter = makeBlockHeader(2, { timestamp });

    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => {
      return Promise.all(
        tags.map(async (t: SiloedTag) =>
          t.equals(tag)
            ? [
                makeLog(TxHash.random(), await blockHeaderBefore.hash(), anchorBlockNumber - 1, timestamp, tag),
                makeLog(TxHash.random(), await blockHeaderAtAnchor.hash(), anchorBlockNumber, timestamp, tag),
                makeLog(TxHash.random(), await blockHeaderAfter.hash(), anchorBlockNumber + 1, timestamp, tag),
              ]
            : [],
        ),
      );
    });

    const result = await loadLogsForRange(secret, app, aztecNode, 0, 10, BlockNumber(anchorBlockNumber));

    // Should only include logs from blocks at or before the anchor block number
    expect(result).toHaveLength(2);
  });
});
