import { getRoundForSlot, getRoundsForEpoch } from './helpers.js';
import type { Offense, OffenseIdentifier, SlashPayload, SlashPayloadRound, ValidatorSlash } from './types.js';
import { OffenseType } from './types.js';

/**
 * Returns true if the offense is uncontroversial as in it can be verified via L1 data alone,
 * and does not depend on the local view of the node of the L2 p2p network.
 * @param offense - The offense type to check
 */
export function isOffenseUncontroversial(offense: OffenseType): boolean {
  return (
    offense === OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS ||
    offense === OffenseType.PROPOSED_INCORRECT_ATTESTATIONS ||
    offense === OffenseType.ATTESTED_DESCENDANT_OF_INVALID
  );
}

/** Extracts offense identifiers (validator, epoch, offense type) from an Empire-based SlashPayload */
export function getOffenseIdentifiersFromPayload(payload: SlashPayload | SlashPayloadRound): OffenseIdentifier[] {
  return payload.slashes.flatMap((slash: ValidatorSlash) =>
    slash.offenses.map(o => ({
      validator: slash.validator,
      offenseType: o.offenseType,
      epochOrSlot: o.epochOrSlot,
    })),
  );
}

/** Creates ValidatorSlashes used to create an Empire-based SlashPayload from a set of Offenses */
export function offensesToValidatorSlash(offenses: Offense[]): ValidatorSlash[] {
  return offenses.map(offense => ({
    validator: offense.validator,
    amount: offense.amount,
    offenses: [{ epochOrSlot: offense.epochOrSlot, offenseType: offense.offenseType }],
  }));
}

/**
 * Sorts offense data by:
 * - Uncontroversial offenses first
 * - Slash amount (descending)
 * - Epoch or slot (ascending, ie oldest first)
 * - Validator address (ascending)
 * - Offense type (descending)
 */
export function offenseDataComparator(a: Offense, b: Offense): number {
  return (
    Number(isOffenseUncontroversial(b.offenseType)) - Number(isOffenseUncontroversial(a.offenseType)) ||
    Number(b.amount - a.amount) ||
    Number(a.epochOrSlot - b.epochOrSlot) ||
    a.validator.toString().localeCompare(b.validator.toString()) ||
    Number(b.offenseType) - Number(a.offenseType)
  );
}

/**
 * Returns the first round in which the offense is eligible for being included in an Empire-based slash payload.
 * Should be equal to to the first round that starts strictly after the offense becomes detectable.
 */
export function getFirstEligibleRoundForOffense(
  offense: OffenseIdentifier,
  constants: { slashingRoundSize: number; epochDuration: number; proofSubmissionEpochs: number },
): bigint {
  // TODO(palla/slash): Check for off-by-ones
  switch (offense.offenseType) {
    // Inactivity is detected at the end of the epoch, so we flag it as detected in the first fresh round for the next epoch
    case OffenseType.INACTIVITY: {
      const epoch = offense.epochOrSlot;
      const detectedEpoch = epoch + 1n;
      return getRoundsForEpoch(detectedEpoch, constants)[0] + 1n;
    }
    // These offenses are detected once an epoch is pruned, which happens after the proof submission window
    case OffenseType.VALID_EPOCH_PRUNED:
    case OffenseType.DATA_WITHHOLDING: {
      // TODO(palla/slash): Check for off-by-ones especially here
      const epoch = offense.epochOrSlot;
      const detectedEpoch = epoch + BigInt(constants.proofSubmissionEpochs);
      return getRoundsForEpoch(detectedEpoch, constants)[0] + 1n;
    }
    // These offenses are detected immediately in the slot they occur, so we assume they are detected in the first round for the following slot
    case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
    case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
    case OffenseType.ATTESTED_DESCENDANT_OF_INVALID:
    case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL: {
      const slot = offense.epochOrSlot;
      const detectedSlot = slot + 1n;
      return getRoundForSlot(detectedSlot, constants).round + 1n;
    }
    // Assume these are epoch-based offenses, even though we should never have to process these
    case OffenseType.UNKNOWN: {
      const epoch = offense.epochOrSlot;
      const detectedEpoch = epoch + 1n;
      return getRoundsForEpoch(detectedEpoch, constants)[0] + 1n;
    }
    default: {
      const _: never = offense.offenseType;
      throw new Error(`Unknown offense type: ${offense.offenseType}`);
    }
  }
}
