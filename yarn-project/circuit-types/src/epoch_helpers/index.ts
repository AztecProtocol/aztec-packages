import { AZTEC_EPOCH_DURATION, AZTEC_SLOT_DURATION } from '@aztec/circuits.js';

/** Returns the slot number for a given timestamp. */
export function getSlotAtTimestamp(ts: bigint, constants: { l1GenesisTime: bigint }) {
  return ts < constants.l1GenesisTime ? 0n : (ts - constants.l1GenesisTime) / BigInt(AZTEC_SLOT_DURATION);
}

/** Returns the epoch number for a given timestamp. */
export function getEpochNumberAtTimestamp(ts: bigint, constants: { l1GenesisTime: bigint }) {
  return getSlotAtTimestamp(ts, constants) / BigInt(AZTEC_EPOCH_DURATION);
}

/** Returns the range of slots (inclusive) for a given epoch number. */
export function getSlotRangeForEpoch(epochNumber: bigint) {
  const startSlot = epochNumber * BigInt(AZTEC_EPOCH_DURATION);
  return [startSlot, startSlot + BigInt(AZTEC_EPOCH_DURATION) - 1n];
}

/** Returns the range of L1 timestamps (inclusive) for a given epoch number. */
export function getTimestampRangeForEpoch(epochNumber: bigint, constants: { l1GenesisTime: bigint }) {
  const [startSlot, endSlot] = getSlotRangeForEpoch(epochNumber);
  return [
    constants.l1GenesisTime + startSlot * BigInt(AZTEC_SLOT_DURATION),
    constants.l1GenesisTime + endSlot * BigInt(AZTEC_SLOT_DURATION),
  ];
}

export type L1RollupConstants = {
  l1StartBlock: bigint;
  l1GenesisTime: bigint;
};

export const EmptyL1RollupConstants: L1RollupConstants = {
  l1StartBlock: 0n,
  l1GenesisTime: 0n,
};
