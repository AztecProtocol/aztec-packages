import type { EpochNumber } from '@aztec/foundation/branded-types';

/** Thrown when the epoch's sampling data has not yet been finalized on L1. */
export class EpochNotFinalizedError extends Error {
  constructor(
    public readonly epoch: EpochNumber,
    public readonly samplingTimestamp: bigint,
    public readonly l1FinalizedTimestamp: bigint,
  ) {
    super(
      `Cannot query committee for epoch ${epoch}: ` +
        `sampling timestamp ${samplingTimestamp} is beyond last finalized L1 block at ${l1FinalizedTimestamp}. ` +
        `The epoch's RANDAO seed and validator set may not be finalized yet.`,
    );
    this.name = 'EpochNotFinalizedError';
  }
}

/** Thrown when the L1 contract rejects the query because the epoch is not yet stable (sampling timestamp > latest L1 block). */
export class EpochNotStableError extends Error {
  constructor(
    public readonly epoch: EpochNumber,
    public readonly l1Error: Error,
  ) {
    super(`Cannot query committee for epoch ${epoch}: epoch is not yet stable on L1.`, { cause: l1Error });
    this.name = 'EpochNotStableError';
  }
}
