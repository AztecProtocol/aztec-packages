import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';

import { type L1RollupConstants, getEpochAtSlot, getSlotRangeForEpoch } from '../epoch-helpers/index.js';
import type { SlasherConfig } from '../interfaces/slasher.js';
import { type Offense, OffenseType } from './types.js';

/** Returns the voting round number and voting slot within the round for a given L2 slot. */
export function getRoundForSlot(
  slot: SlotNumber,
  constants: { slashingRoundSize: number },
): { round: bigint; votingSlot: SlotNumber } {
  const roundSize = BigInt(constants.slashingRoundSize);
  const slotBigInt = BigInt(slot);
  const round = slotBigInt / roundSize;
  const votingSlot = SlotNumber.fromBigInt(slotBigInt % roundSize);
  return { round, votingSlot };
}

/** Returns the voting round(s) lower and upper bounds (inclusive) covered by the given epoch */
export function getRoundsForEpoch(
  epoch: EpochNumber,
  constants: { slashingRoundSize: number; epochDuration: number },
): [bigint, bigint] {
  const [start, end] = getSlotRangeForEpoch(epoch, constants);
  const startRound = getRoundForSlot(start, constants).round;
  const endRound = getRoundForSlot(end, constants).round;
  return [startRound, endRound];
}

/** Returns the epochs spanned during a given slashing round */
export function getEpochsForRound(
  round: bigint,
  constants: { slashingRoundSize: number; epochDuration: number },
): EpochNumber[] {
  const epochs: EpochNumber[] = [];
  const firstSlot = SlotNumber.fromBigInt(round * BigInt(constants.slashingRoundSize));
  const lastSlot = SlotNumber(firstSlot + constants.slashingRoundSize - 1);
  const startEpoch = getEpochAtSlot(firstSlot, constants);
  const endEpoch = getEpochAtSlot(lastSlot, constants);
  for (let epoch = startEpoch; epoch <= endEpoch; epoch = EpochNumber(epoch + 1)) {
    epochs.push(epoch);
  }
  return epochs;
}

/** Reads the configured penalty for a given offense type from a slasher config struct */
export function getPenaltyForOffense(
  offense: OffenseType,
  config: Pick<
    SlasherConfig,
    | 'slashAttestDescendantOfInvalidPenalty'
    | 'slashBroadcastedInvalidBlockPenalty'
    | 'slashDuplicateProposalPenalty'
    | 'slashDuplicateAttestationPenalty'
    | 'slashPrunePenalty'
    | 'slashDataWithholdingPenalty'
    | 'slashUnknownPenalty'
    | 'slashInactivityPenalty'
    | 'slashProposeInvalidAttestationsPenalty'
  >,
) {
  switch (offense) {
    case OffenseType.VALID_EPOCH_PRUNED:
      return config.slashPrunePenalty;
    case OffenseType.DATA_WITHHOLDING:
      return config.slashDataWithholdingPenalty;
    case OffenseType.INACTIVITY:
      return config.slashInactivityPenalty;
    case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
    case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
      return config.slashProposeInvalidAttestationsPenalty;
    case OffenseType.ATTESTED_DESCENDANT_OF_INVALID:
      return config.slashAttestDescendantOfInvalidPenalty;
    case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL:
      return config.slashBroadcastedInvalidBlockPenalty;
    case OffenseType.DUPLICATE_PROPOSAL:
      return config.slashDuplicateProposalPenalty;
    case OffenseType.DUPLICATE_ATTESTATION:
      return config.slashDuplicateAttestationPenalty;
    case OffenseType.UNKNOWN:
      return config.slashUnknownPenalty;
    default: {
      const _exhaustiveCheck: never = offense;
      throw new Error(`Unknown offense type: ${_exhaustiveCheck}`);
    }
  }
}

/** Returns whether the `epochOrSlot` field for an offense references an epoch or a slot */
export function getTimeUnitForOffense(offense: OffenseType): 'epoch' | 'slot' {
  switch (offense) {
    case OffenseType.ATTESTED_DESCENDANT_OF_INVALID:
    case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL:
    case OffenseType.DUPLICATE_PROPOSAL:
    case OffenseType.DUPLICATE_ATTESTATION:
    case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
    case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
      return 'slot';
    case OffenseType.INACTIVITY:
    case OffenseType.DATA_WITHHOLDING:
    case OffenseType.UNKNOWN:
    case OffenseType.VALID_EPOCH_PRUNED:
      return 'epoch';
    default: {
      const _exhaustiveCheck: never = offense;
      throw new Error(`Unknown offense type: ${_exhaustiveCheck}`);
    }
  }
}

/** Returns the slot for a given offense. If the offense references an epoch, returns the first slot of the epoch. */
export function getSlotForOffense(
  offense: Pick<Offense, 'epochOrSlot' | 'offenseType'>,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
): SlotNumber {
  const { epochOrSlot, offenseType } = offense;
  return getTimeUnitForOffense(offenseType) === 'epoch'
    ? SlotNumber.fromBigInt(epochOrSlot * BigInt(constants.epochDuration))
    : SlotNumber.fromBigInt(epochOrSlot);
}

/** Returns the epoch for a given offense. If the offense type or epoch is not defined, returns undefined. */
export function getEpochForOffense(
  offense: Pick<Offense, 'epochOrSlot' | 'offenseType'>,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
): bigint;
export function getEpochForOffense(
  offense: Partial<Pick<Offense, 'epochOrSlot' | 'offenseType'>>,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
): bigint | undefined;
export function getEpochForOffense(
  offense: Partial<Pick<Offense, 'epochOrSlot' | 'offenseType'>>,
  constants: Pick<L1RollupConstants, 'epochDuration'>,
): bigint | undefined {
  const { epochOrSlot, offenseType } = offense;
  if (epochOrSlot === undefined || offenseType === undefined) {
    return undefined;
  }
  return getTimeUnitForOffense(offenseType) === 'epoch' ? epochOrSlot : epochOrSlot / BigInt(constants.epochDuration);
}

/** Returns the slashing round in which a given offense occurred. */
export function getRoundForOffense(
  offense: Pick<Offense, 'epochOrSlot' | 'offenseType'>,
  constants: { slashingRoundSize: number; epochDuration: number },
): bigint {
  const slot = getSlotForOffense(offense, constants);
  return getRoundForSlot(slot, constants).round;
}
