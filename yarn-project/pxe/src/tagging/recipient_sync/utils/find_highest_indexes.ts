import { MAX_TX_LIFETIME } from '@aztec/constants';
import type { TxScopedL2Log } from '@aztec/stdlib/logs';

/**
 * Finds the highest aged and the highest finalized tagging indexes.
 */
export function findHighestIndexes(
  privateLogsWithIndexes: Array<{ log: TxScopedL2Log; taggingIndex: number }>,
  currentTimestamp: bigint,
  finalizedBlockNumber: number,
): { highestAgedIndex: number | undefined; highestFinalizedIndex: number | undefined } {
  let highestAgedIndex = undefined;
  let highestFinalizedIndex = undefined;

  for (const { log, taggingIndex } of privateLogsWithIndexes) {
    const ageInSeconds = currentTimestamp - log.blockTimestamp;

    if (
      ageInSeconds >= BigInt(MAX_TX_LIFETIME) &&
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
