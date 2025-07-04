import { MAX_INCLUDE_BY_TIMESTAMP_DURATION } from '@aztec/constants';
import type { PrivateKernelCircuitPublicInputs } from '@aztec/stdlib/kernel';
import type { UInt64 } from '@aztec/stdlib/types';

const ROUNDED_DURATIONS = [
  3600, // 1 hour
  1800, // 30 mins
  1, // 1 second
];

function roundTimestamp(blockTimestamp: bigint, includeByTimestamp: bigint): UInt64 {
  return ROUNDED_DURATIONS.reduce((timestamp, duration) => {
    if (timestamp <= blockTimestamp) {
      // The timestamp must be greater than the block timestamp.
      // If it is too small, round it down again using a smaller duration.
      const totalDuration = includeByTimestamp - blockTimestamp;
      const roundedDuration = totalDuration - (totalDuration % BigInt(duration));
      return blockTimestamp + roundedDuration;
    }
    return timestamp;
  }, 0n);
}

export function computeTxIncludeByTimestamp(
  previousKernel: PrivateKernelCircuitPublicInputs,
  maxDuration = MAX_INCLUDE_BY_TIMESTAMP_DURATION,
): UInt64 {
  if (maxDuration > MAX_INCLUDE_BY_TIMESTAMP_DURATION) {
    throw new Error(
      `Custom max duration cannot be greater than the max allowed. Max allowed: ${MAX_INCLUDE_BY_TIMESTAMP_DURATION}. Custom value: ${maxDuration}.`,
    );
  }

  const blockTimestamp = previousKernel.constants.historicalHeader.globalVariables.timestamp;
  const maxTimestamp = blockTimestamp + BigInt(maxDuration);
  const includeByTimestamp = previousKernel.includeByTimestamp;

  // If the includeByTimestamp set during the tx execution is greater than or equal to the max allowed duration,
  // use the maximum allowed timestamp.
  // Note: It shouldn't be larger than the max allowed duration, but we check for it anyway.
  if (includeByTimestamp >= maxTimestamp) {
    return maxTimestamp;
  }

  // Round it down to the nearest hour/min/second to reduce precision and avoid revealing the exact value.
  // This makes it harder for others to infer what function calls may have been used to produce a specific timestamp.
  const roundedTimestamp = roundTimestamp(blockTimestamp, includeByTimestamp);

  // The tx can't be published if the timestamp is the same or less than the historical block's timestamp.
  // Future blocks will have a greater timestamp, so the tx would never be included.
  if (roundedTimestamp <= blockTimestamp) {
    throw new Error(
      `Include-by timestamp must be greater than the historical block timestamp. Block timestamp: ${blockTimestamp}. Include-by timestamp: ${includeByTimestamp}.`,
    );
  }

  return roundedTimestamp;
}
