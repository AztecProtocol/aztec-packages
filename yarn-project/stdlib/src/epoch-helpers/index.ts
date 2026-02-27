import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import { schemas, zodFor } from '../schemas/index.js';

export type L1RollupConstants = {
  l1StartBlock: bigint;
  l1GenesisTime: bigint;
  slotDuration: number;
  epochDuration: number;
  ethereumSlotDuration: number;
  proofSubmissionEpochs: number;
  targetCommitteeSize: number;
};

export const EmptyL1RollupConstants: L1RollupConstants = {
  l1StartBlock: 0n,
  l1GenesisTime: 0n,
  epochDuration: 1, // Not 0 to pervent division by zero
  slotDuration: 1,
  ethereumSlotDuration: 1,
  proofSubmissionEpochs: 1,
  targetCommitteeSize: 48,
};

export const L1RollupConstantsSchema = zodFor<L1RollupConstants>()(
  z.object({
    l1StartBlock: schemas.BigInt,
    l1GenesisTime: schemas.BigInt,
    slotDuration: z.number(),
    epochDuration: z.number(),
    ethereumSlotDuration: z.number(),
    proofSubmissionEpochs: z.number(),
    targetCommitteeSize: z.number(),
  }),
);

/** Returns the timestamp for a given L2 slot. */
export function getTimestampForSlot(
  slot: SlotNumber,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
) {
  return constants.l1GenesisTime + BigInt(slot) * BigInt(constants.slotDuration);
}

/** Returns the slot number for a given timestamp. */
export function getSlotAtTimestamp(
  ts: bigint,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration'>,
): SlotNumber {
  return ts < constants.l1GenesisTime
    ? SlotNumber.ZERO
    : SlotNumber.fromBigInt((ts - constants.l1GenesisTime) / BigInt(constants.slotDuration));
}

/** Returns the L2 slot number at the next L1 block based on the current timestamp. */
export function getSlotAtNextL1Block(
  currentL1Timestamp: bigint,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>,
): SlotNumber {
  const nextL1BlockTimestamp = currentL1Timestamp + BigInt(constants.ethereumSlotDuration);
  return getSlotAtTimestamp(nextL1BlockTimestamp, constants);
}

/** Returns the epoch number for a given timestamp. */
export function getEpochNumberAtTimestamp(
  ts: bigint,
  constants: Pick<L1RollupConstants, 'epochDuration' | 'slotDuration' | 'l1GenesisTime'>,
): EpochNumber {
  return getEpochAtSlot(getSlotAtTimestamp(ts, constants), constants);
}

/** Returns the epoch number for a given slot. */
export function getEpochAtSlot(slot: SlotNumber, constants: Pick<L1RollupConstants, 'epochDuration'>): EpochNumber {
  return EpochNumber.fromBigInt(BigInt(slot) / BigInt(constants.epochDuration));
}

/** Returns the range of L2 slots (inclusive) for a given epoch number. */
export function getSlotRangeForEpoch(
  epochNumber: EpochNumber,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
): [SlotNumber, SlotNumber] {
  const startSlot = SlotNumber(Number(epochNumber) * constants.epochDuration);
  return [startSlot, SlotNumber(startSlot + constants.epochDuration - 1)];
}

/**
 * Returns the range of L1 timestamps (inclusive) for a given epoch number.
 * Note that the endTimestamp is the start timestamp of the last L1 slot for the epoch.
 */
export function getTimestampRangeForEpoch(
  epochNumber: EpochNumber,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration' | 'ethereumSlotDuration'>,
): [bigint, bigint] {
  const [startSlot, endSlot] = getSlotRangeForEpoch(epochNumber, constants);
  const ethereumSlotsPerL2Slot = constants.slotDuration / constants.ethereumSlotDuration;
  return [
    constants.l1GenesisTime + BigInt(startSlot) * BigInt(constants.slotDuration),
    constants.l1GenesisTime +
      BigInt(endSlot) * BigInt(constants.slotDuration) +
      BigInt((ethereumSlotsPerL2Slot - 1) * constants.ethereumSlotDuration),
  ];
}

/**
 * Returns the start timestamp for a given epoch number.
 */
export function getStartTimestampForEpoch(
  epochNumber: EpochNumber,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration'>,
) {
  const [startSlot] = getSlotRangeForEpoch(epochNumber, constants);
  return getTimestampForSlot(startSlot, constants);
}

/**
 * Returns the epoch number at which proofs are no longer accepted for a given epoch.
 * See l1-contracts/src/core/libraries/TimeLib.sol
 */
export function getProofSubmissionDeadlineEpoch(
  epochNumber: EpochNumber,
  constants: Pick<L1RollupConstants, 'proofSubmissionEpochs'>,
): EpochNumber {
  return EpochNumber(epochNumber + constants.proofSubmissionEpochs + 1);
}

/**
 * Returns the deadline timestamp (in seconds) for submitting a proof for a given epoch.
 * Computed as the start of the given epoch plus the proof submission window.
 */
export function getProofSubmissionDeadlineTimestamp(
  epochNumber: EpochNumber,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'epochDuration' | 'proofSubmissionEpochs'>,
) {
  // See l1-contracts/src/core/libraries/TimeLib.sol:
  // return toSlots(_a) + Slot.wrap(store.epochDuration * (store.proofSubmissionEpochs + 1));
  const deadlineEpoch = getProofSubmissionDeadlineEpoch(epochNumber, constants);
  const [deadlineSlot] = getSlotRangeForEpoch(deadlineEpoch, constants);
  return getTimestampForSlot(deadlineSlot, constants);
}

/** Returns the timestamp to start building a block for a given L2 slot. Computed as the start timestamp of the slot minus one L1 slot duration. */
export function getSlotStartBuildTimestamp(
  slotNumber: SlotNumber,
  constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>,
): number {
  return Number(constants.l1GenesisTime) + slotNumber * constants.slotDuration - constants.ethereumSlotDuration;
}
