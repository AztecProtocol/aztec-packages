import { MAX_TX_LIFETIME } from '@aztec/constants';
import type { PrivateKernelCircuitPublicInputs } from '@aztec/stdlib/kernel';
import type { UInt64 } from '@aztec/stdlib/types';

const ROUNDED_DURATIONS = [
  3600, // 1 hour
  1800, // 30 mins
  1, // 1 second
];

function roundTimestamp(blockTimestamp: bigint, expirationTimestamp: bigint): UInt64 {
  return ROUNDED_DURATIONS.reduce((timestamp, duration) => {
    if (timestamp <= blockTimestamp) {
      // The timestamp must be greater than the block timestamp.
      // If it is too small, round it down again using a smaller duration.
      const totalDuration = expirationTimestamp - blockTimestamp;
      const roundedDuration = totalDuration - (totalDuration % BigInt(duration));
      return blockTimestamp + roundedDuration;
    }
    return timestamp;
  }, 0n);
}

export function computeTxExpirationTimestamp(
  previousKernel: PrivateKernelCircuitPublicInputs,
  txLifetime = MAX_TX_LIFETIME,
): UInt64 {
  if (txLifetime > MAX_TX_LIFETIME) {
    throw new Error(
      `Custom tx lifetime cannot be greater than the max allowed. Max allowed: ${MAX_TX_LIFETIME}. Custom value: ${txLifetime}.`,
    );
  }

  const anchorBlockTimestamp = previousKernel.constants.anchorBlockHeader.globalVariables.timestamp;
  const maxTimestamp = anchorBlockTimestamp + BigInt(txLifetime);
  const expirationTimestamp = previousKernel.expirationTimestamp;

  // If the expirationTimestamp set during the tx execution is greater than or equal to the max allowed duration,
  // use the maximum allowed timestamp.
  // Note: It shouldn't be larger than the max allowed duration, but we check for it anyway.
  if (expirationTimestamp >= maxTimestamp) {
    return maxTimestamp;
  }

  // Round it down to the nearest hour/min/second to reduce precision and avoid revealing the exact value.
  // This makes it harder for others to infer what function calls may have been used to produce a specific timestamp.
  const roundedTimestamp = roundTimestamp(anchorBlockTimestamp, expirationTimestamp);

  // The tx can't be published if the timestamp is the same or less than the anchor block's timestamp.
  // Future blocks will have a greater timestamp, so the tx would never be included.
  if (roundedTimestamp <= anchorBlockTimestamp) {
    throw new Error(
      `Include-by timestamp must be greater than the anchor block timestamp. Anchor block timestamp: ${anchorBlockTimestamp}. Include-by timestamp: ${expirationTimestamp}.`,
    );
  }

  return roundedTimestamp;
}
