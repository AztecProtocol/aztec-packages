type TimeConstants = {
  l1GenesisTime: bigint;
  epochDuration: number;
  slotDuration: number;
};

/** Returns the slot number for a given timestamp. */
export function getSlotAtTimestamp(ts: bigint, constants: Pick<TimeConstants, 'l1GenesisTime' | 'slotDuration'>) {
  return ts < constants.l1GenesisTime ? 0n : (ts - constants.l1GenesisTime) / BigInt(constants.slotDuration);
}

/** Returns the epoch number for a given timestamp. */
export function getEpochNumberAtTimestamp(ts: bigint, constants: TimeConstants) {
  return getSlotAtTimestamp(ts, constants) / BigInt(constants.epochDuration);
}

/** Returns the range of slots (inclusive) for a given epoch number. */
export function getSlotRangeForEpoch(epochNumber: bigint, constants: Pick<TimeConstants, 'epochDuration'>) {
  const startSlot = epochNumber * BigInt(constants.epochDuration);
  return [startSlot, startSlot + BigInt(constants.epochDuration) - 1n];
}

/** Returns the range of L1 timestamps (inclusive) for a given epoch number. */
export function getTimestampRangeForEpoch(epochNumber: bigint, constants: TimeConstants) {
  const [startSlot, endSlot] = getSlotRangeForEpoch(epochNumber, constants);
  return [
    constants.l1GenesisTime + startSlot * BigInt(constants.slotDuration),
    constants.l1GenesisTime + endSlot * BigInt(constants.slotDuration),
  ];
}
