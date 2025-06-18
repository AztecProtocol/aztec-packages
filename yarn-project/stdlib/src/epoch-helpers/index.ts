import { z } from 'zod';

import { type ZodFor, schemas } from '../schemas/index.js';

export type L1RollupConstants = {
  l1StartBlock: bigint;
  l1GenesisTime: bigint;
  slotDuration: number;
  epochDuration: number;
  ethereumSlotDuration: number;
  proofSubmissionEpochs: number;
};

export const EmptyL1RollupConstants: L1RollupConstants = {
  l1StartBlock: 0n,
  l1GenesisTime: 0n,
  epochDuration: 1, // Not 0 to pervent division by zero
  slotDuration: 1,
  ethereumSlotDuration: 1,
  proofSubmissionEpochs: 1,
};

export const L1RollupConstantsSchema = z.object({
  l1StartBlock: schemas.BigInt,
  l1GenesisTime: schemas.BigInt,
  slotDuration: z.number(),
  epochDuration: z.number(),
  ethereumSlotDuration: z.number(),
  proofSubmissionEpochs: z.number(),
}) satisfies ZodFor<L1RollupConstants>;

/** Returns the timestamp for a given L2 slot. */
export function getTimestampForSlot(
  slot: bigint,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
) {
  return constants.l1GenesisTime + slot * BigInt(constants.slotDuration);
}

/** Returns the slot number for a given timestamp. */
export function getSlotAtTimestamp(ts: bigint, constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>) {
  return ts < constants.l1GenesisTime ? 0n : (ts - constants.l1GenesisTime) / BigInt(constants.slotDuration);
}

/** Returns the epoch number for a given timestamp. */
export function getEpochNumberAtTimestamp(
  ts: bigint,
  constants: Pick<L1RollupConstants, 'epochDuration' | 'slotDuration' | 'l1GenesisTime'>,
) {
  return getEpochAtSlot(getSlotAtTimestamp(ts, constants), constants);
}

/** Returns the epoch number for a given slot. */
export function getEpochAtSlot(slot: bigint, constants: Pick<L1RollupConstants, 'epochDuration'>) {
  return slot / BigInt(constants.epochDuration);
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

/**
 * Returns the epoch number at which proofs are no longer accepted for a given epoch.
 * See l1-contracts/src/core/libraries/TimeLib.sol
 */
export function getProofSubmissionDeadlineEpoch(
  epochNumber: bigint,
  constants: Pick<L1RollupConstants, 'proofSubmissionEpochs'>,
) {
  return epochNumber + BigInt(constants.proofSubmissionEpochs + 1);
}

/**
 * Returns the deadline timestamp (in seconds) for submitting a proof for a given epoch.
 * Computed as the start of the given epoch plus the proof submission window.
 */
export function getProofSubmissionDeadlineTimestamp(
  epochNumber: bigint,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration' | 'proofSubmissionEpochs'>,
) {
  // See l1-contracts/src/core/libraries/TimeLib.sol:
  // return toSlots(_a) + Slot.wrap(store.epochDuration * (store.proofSubmissionEpochs + 1));
  const deadlineEpoch = getProofSubmissionDeadlineEpoch(epochNumber, constants);
  const [deadlineSlot] = getSlotRangeForEpoch(deadlineEpoch, constants);
  return getTimestampForSlot(deadlineSlot, constants);
}
