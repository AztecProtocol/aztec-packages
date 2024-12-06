export type L1RollupConstants = {
  l1StartBlock: bigint;
  l1GenesisTime: bigint;
  slotDuration: number;
  epochDuration: number;
  ethereumSlotDuration: number;
};

export const EmptyL1RollupConstants: L1RollupConstants = {
  l1StartBlock: 0n,
  l1GenesisTime: 0n,
  epochDuration: 1, // Not 0 to pervent division by zero
  slotDuration: 1,
  ethereumSlotDuration: 1,
};

export type EpochConstants = {
  l1GenesisBlock: bigint;
  l1GenesisTime: bigint;
  epochDuration: number;
  slotDuration: number;
};

/** Returns the slot number for a given timestamp. */
export function getSlotAtTimestamp(ts: bigint, constants: Pick<EpochConstants, 'l1GenesisTime' | 'slotDuration'>) {
  return ts < constants.l1GenesisTime ? 0n : (ts - constants.l1GenesisTime) / BigInt(constants.slotDuration);
}

/** Returns the epoch number for a given timestamp. */
export function getEpochNumberAtTimestamp(
  ts: bigint,
  constants: Pick<EpochConstants, 'epochDuration' | 'slotDuration' | 'l1GenesisTime'>,
) {
  return getSlotAtTimestamp(ts, constants) / BigInt(constants.epochDuration);
}

/** Returns the range of L2 slots (inclusive) for a given epoch number. */
export function getSlotRangeForEpoch(epochNumber: bigint, constants: Pick<EpochConstants, 'epochDuration'>) {
  const startSlot = epochNumber * BigInt(constants.epochDuration);
  return [startSlot, startSlot + BigInt(constants.epochDuration) - 1n];
}

/** Returns the range of L1 timestamps (inclusive) for a given epoch number. */
export function getTimestampRangeForEpoch(
  epochNumber: bigint,
  constants: Pick<EpochConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration'>,
) {
  const [startSlot, endSlot] = getSlotRangeForEpoch(epochNumber, constants);
  return [
    constants.l1GenesisTime + startSlot * BigInt(constants.slotDuration),
    constants.l1GenesisTime + endSlot * BigInt(constants.slotDuration),
  ];
}

/**
 * Returns the range of L1 blocks (inclusive) for a given epoch number.
 * @remarks This assumes no time warp has happened.
 */
export function getL1BlockRangeForEpoch(
  epochNumber: bigint,
  constants: Pick<EpochConstants, 'l1GenesisBlock' | 'epochDuration' | 'slotDuration'>,
) {
  const epochDurationInL1Blocks = BigInt(constants.epochDuration) * BigInt(constants.slotDuration);
  return [
    epochNumber * epochDurationInL1Blocks + constants.l1GenesisBlock,
    (epochNumber + 1n) * epochDurationInL1Blocks + constants.l1GenesisBlock - 1n,
  ];
}
