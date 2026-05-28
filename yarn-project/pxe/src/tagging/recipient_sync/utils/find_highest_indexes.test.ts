import { MAX_TX_LIFETIME } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { LogResult } from '@aztec/stdlib/logs';

import { findHighestIndexes } from './find_highest_indexes.js';

describe('findHighestIndexes', () => {
  const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

  function makeLog(blockNumber: number, blockTimestamp: bigint): LogResult {
    const random = LogResult.random(/* includeEffects */ true);
    return LogResult.from({ ...random, blockNumber: BlockNumber(blockNumber), blockTimestamp });
  }

  it('returns undefined for highestAgedIndex when no logs are at least 24 hours old', () => {
    const finalizedBlockNumber = 10;
    const blockTimestamp = currentTimestamp - 1n; // not aged
    const log = makeLog(5, blockTimestamp);

    const result = findHighestIndexes([{ log, taggingIndex: 3 }], currentTimestamp, finalizedBlockNumber);

    expect(result.highestAgedIndex).toBeUndefined();
    expect(result.highestFinalizedIndex).toBe(3);
  });

  it('returns undefined for highestFinalizedIndex when no logs are in finalized blocks', () => {
    const finalizedBlockNumber = 5;
    const blockTimestamp = currentTimestamp - BigInt(MAX_TX_LIFETIME);
    const log = makeLog(10, blockTimestamp); // block 10 > finalizedBlockNumber 5

    const result = findHighestIndexes([{ log, taggingIndex: 3 }], currentTimestamp, finalizedBlockNumber);

    expect(result.highestAgedIndex).toBe(3);
    expect(result.highestFinalizedIndex).toBeUndefined();
  });

  it('selects the highest index from multiple aged logs', () => {
    const finalizedBlockNumber = 10;
    const blockTimestamp1 = currentTimestamp - BigInt(MAX_TX_LIFETIME) - 1000n; // aged
    const blockTimestamp2 = currentTimestamp - BigInt(MAX_TX_LIFETIME) - 500n; // aged
    const log1 = makeLog(5, blockTimestamp1);
    const log2 = makeLog(6, blockTimestamp2);

    const result = findHighestIndexes(
      [
        { log: log1, taggingIndex: 2 },
        { log: log2, taggingIndex: 5 },
        { log: log1, taggingIndex: 3 },
      ],
      currentTimestamp,
      finalizedBlockNumber,
    );

    expect(result.highestAgedIndex).toBe(5);
    expect(result.highestFinalizedIndex).toBe(5);
  });

  it('selects the highest index from multiple finalized logs', () => {
    const finalizedBlockNumber = 10;
    const blockTimestamp = currentTimestamp - 500n; // 500 seconds ago - not aged
    const log1 = makeLog(5, blockTimestamp);
    const log2 = makeLog(8, blockTimestamp);
    const log3 = makeLog(10, blockTimestamp); // At finalized block number

    const result = findHighestIndexes(
      [
        { log: log1, taggingIndex: 2 },
        { log: log2, taggingIndex: 7 },
        { log: log3, taggingIndex: 1 },
      ],
      currentTimestamp,
      finalizedBlockNumber,
    );

    expect(result.highestAgedIndex).toBeUndefined();
    expect(result.highestFinalizedIndex).toBe(7);
  });

  it('handles mixed scenarios with multiple logs of different types', () => {
    const finalizedBlockNumber = 10;
    const veryOldTimestamp = currentTimestamp - BigInt(MAX_TX_LIFETIME) * 2n - 1000n; // Aged
    const oldTimestamp = currentTimestamp - BigInt(MAX_TX_LIFETIME) - 1000n; // Aged
    const recentTimestamp = currentTimestamp - 5000n; // Not aged

    const logs = [
      { log: makeLog(5, veryOldTimestamp), taggingIndex: 1 }, // Aged, finalized
      { log: makeLog(8, oldTimestamp), taggingIndex: 5 }, // Aged, finalized
      { log: makeLog(10, recentTimestamp), taggingIndex: 8 }, // Not aged, finalized
      { log: makeLog(15, oldTimestamp), taggingIndex: 12 }, // Aged, not finalized
      { log: makeLog(20, recentTimestamp), taggingIndex: 15 }, // Not aged, not finalized
    ];

    const result = findHighestIndexes(logs, currentTimestamp, finalizedBlockNumber);

    // Highest aged: index 12 (from block 15, which is aged but not finalized)
    expect(result.highestAgedIndex).toBe(12);
    // Highest finalized: index 8 (from block 10, which is finalized but not aged)
    expect(result.highestFinalizedIndex).toBe(8);
  });
});
