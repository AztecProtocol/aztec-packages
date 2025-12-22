import { MAX_INCLUDE_BY_TIMESTAMP_DURATION } from '@aztec/constants';
import type { TxScopedL2Log } from '@aztec/stdlib/logs';

/**
 * Finds the highest aged and the highest finalized tagging indexes.
 */
export function findHighestIndexes(
  logsWithTimestampsAndIndexes: Array<{ log: TxScopedL2Log; blockTimestamp: bigint; taggingIndex: number }>,
  currentTimestamp: bigint,
  finalizedBlockNumber: number,
): { highestAgedIndex: number | undefined; highestFinalizedIndex: number | undefined } {
  let highestAgedIndex = undefined;
  let highestFinalizedIndex = undefined;

  for (const { log, blockTimestamp, taggingIndex } of logsWithTimestampsAndIndexes) {
    const ageInSeconds = currentTimestamp - blockTimestamp;

    if (
      ageInSeconds >= BigInt(MAX_INCLUDE_BY_TIMESTAMP_DURATION) &&
      (highestAgedIndex === undefined || taggingIndex > highestAgedIndex)
    ) {
      highestAgedIndex = taggingIndex;
    }

    if (
      log.blockNumber <= finalizedBlockNumber &&
      (highestFinalizedIndex === undefined || taggingIndex > highestFinalizedIndex)
    ) {
      highestFinalizedIndex = taggingIndex;
    }
  }

  return { highestAgedIndex, highestFinalizedIndex };
}
