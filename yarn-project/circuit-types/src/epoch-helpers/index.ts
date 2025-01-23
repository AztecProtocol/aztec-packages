import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

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

export const L1RollupConstantsSchema = z.object({
  l1StartBlock: schemas.BigInt,
  l1GenesisTime: schemas.BigInt,
  slotDuration: z.number(),
  epochDuration: z.number(),
  ethereumSlotDuration: z.number(),
}) satisfies ZodFor<L1RollupConstants>;

/** Returns the slot number for a given timestamp. */
export function getSlotAtTimestamp(ts: bigint, constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>) {
  return ts < constants.l1GenesisTime ? 0n : (ts - constants.l1GenesisTime) / BigInt(constants.slotDuration);
}

/** Returns the epoch number for a given timestamp. */
export function getEpochNumberAtTimestamp(
  ts: bigint,
  constants: Pick<L1RollupConstants, 'epochDuration' | 'slotDuration' | 'l1GenesisTime'>,
) {
  return getSlotAtTimestamp(ts, constants) / BigInt(constants.epochDuration);
}

/** Returns the range of L2 slots (inclusive) for a given epoch number. */
export function getSlotRangeForEpoch(epochNumber: bigint, constants: Pick<L1RollupConstants, 'epochDuration'>) {
  const startSlot = epochNumber * BigInt(constants.epochDuration);
  return [startSlot, startSlot + BigInt(constants.epochDuration) - 1n];
}

/**
 * Returns the range of L1 timestamps (inclusive) for a given epoch number.
 * Note that the endTimestamp is the start timestamp of the last L1 slot for the epoch.
 */
export function getTimestampRangeForEpoch(
  epochNumber: bigint,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration' | 'ethereumSlotDuration'>,
) {
  const [startSlot, endSlot] = getSlotRangeForEpoch(epochNumber, constants);
  const ethereumSlotsPerL2Slot = constants.slotDuration / constants.ethereumSlotDuration;
  return [
    constants.l1GenesisTime + startSlot * BigInt(constants.slotDuration),
    constants.l1GenesisTime +
      endSlot * BigInt(constants.slotDuration) +
      BigInt((ethereumSlotsPerL2Slot - 1) * constants.ethereumSlotDuration),
  ];
}
