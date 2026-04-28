import { sumBigint } from '@aztec/foundation/bigint';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { PartialBy } from '@aztec/foundation/types';

import { getEpochForOffense } from './helpers.js';
import type { Offense, ValidatorSlashVote } from './types.js';

/**
 * Creates a consensus-slash vote for a given set of committees based on a set of Offenses
 * @param offenses - Array of offenses to consider
 * @param committees - Array of committees (each containing array of validator addresses)
 * @param epochsForCommittees - Array of epochs corresponding to each committee
 * @param settings - Settings including slashingAmounts and optional validator override lists
 * @param settings.maxSlashedValidators - If set, limits the total number of [validator, epoch] pairs
 *   with non-zero votes. The lowest-vote pairs are zeroed out to stay within the limit.
 * @param logger - Logger, logs which validators were dropped.
 * @returns Array of ValidatorSlashVote, where each vote is how many slash units the validator in that position should be slashed
 */
export function getSlashConsensusVotesFromOffenses(
  offenses: PartialBy<Offense, 'epochOrSlot'>[],
  committees: EthAddress[][],
  epochsForCommittees: bigint[],
  settings: {
    slashingAmounts: [bigint, bigint, bigint];
    epochDuration: number;
    targetCommitteeSize: number;
    maxSlashedValidators?: number;
  },
  logger: Logger = createLogger('slasher:votes'),
): ValidatorSlashVote[] {
  const { slashingAmounts, targetCommitteeSize, maxSlashedValidators } = settings;

  if (committees.length !== epochsForCommittees.length) {
    throw new Error('committees and epochsForCommittees must have the same length');
  }

  const votes = committees.flatMap((committee, committeeIndex) => {
    const committeeEpoch = epochsForCommittees[committeeIndex];

    // Map over actual committee members, then pad to targetCommitteeSize.
    // Padding handles cases where committees may be empty (e.g., when there aren't enough validators to fill the committee size during network startup).
    const votes = committee.map(validator => {
      // Find offenses for this validator in this specific epoch.
      // If an offense has no epoch, it is considered for all epochs due to a slashAlways setting.
      const validatorOffenses = offenses.filter(
        o =>
          o.validator.equals(validator) &&
          (o.epochOrSlot === undefined || getEpochForOffense(o, settings) === committeeEpoch),
      );

      // Sum up the penalties for this validator in this epoch
      const slashAmount = sumBigint(validatorOffenses.map(o => o.amount));
      const slashUnits = getSlashUnitsForAmount(slashAmount, slashingAmounts);
      return Number(slashUnits);
    });

    return padArrayEnd(votes, 0, targetCommitteeSize);
  });

  // if a cap is set, zero out the lowest-vote [validator, epoch] pairs so that the most severe slashes stay.
  if (maxSlashedValidators === undefined) {
    return votes;
  }

  const nonZeroByDescendingVote = [...votes.entries()].filter(([, vote]) => vote > 0).sort(([, a], [, b]) => b - a);

  const toTruncate = nonZeroByDescendingVote.slice(maxSlashedValidators);
  for (const [idx] of toTruncate) {
    votes[idx] = 0;
  }

  if (toTruncate.length > 0) {
    const truncated = toTruncate.map(([idx]) => {
      const committeeIndex = Math.floor(idx / targetCommitteeSize);
      const positionInCommittee = idx % targetCommitteeSize;
      return {
        validator: committees[committeeIndex][positionInCommittee].toString(),
        epoch: epochsForCommittees[committeeIndex],
      };
    });
    logger.warn(
      `Truncated ${toTruncate.length} validator-epoch pairs to stay within limit of ${maxSlashedValidators}`,
      { truncated },
    );
  }

  return votes;
}

/** Returns the slash vote for the given amount to slash. */
function getSlashUnitsForAmount(amountToSlash: bigint, slashingAmounts: [bigint, bigint, bigint]): number {
  if (amountToSlash >= slashingAmounts[2]) {
    return 3;
  } else if (amountToSlash >= slashingAmounts[1]) {
    return 2;
  } else if (amountToSlash >= slashingAmounts[0]) {
    return 1;
  } else {
    return 0;
  }
}

/**
 * Encodes a set of slash votes into a Buffer for use in a consensus slashing vote transaction.
 * Each vote is represented as a 2-bit value, which represents how many slashing units the validator should be slashed.
 * @param votes - The array of slash votes to encode
 * @returns A Buffer containing the encoded slash votes
 */
export function encodeSlashConsensusVotes(votes: ValidatorSlashVote[]): Buffer {
  if (votes.length % 4 !== 0) {
    throw new Error('Votes array must have a length that is a multiple of 4');
  }
  const buffer = Buffer.alloc(votes.length / 4);
  for (let i = 0; i < votes.length; i += 4) {
    // Encode votes to match Solidity's bit order (LSB to MSB)
    // Bits 0-1: validator at index i
    // Bits 2-3: validator at index i+1
    // Bits 4-5: validator at index i+2
    // Bits 6-7: validator at index i+3
    const voteByte = votes[i] | (votes[i + 1] << 2) | (votes[i + 2] << 4) | (votes[i + 3] << 6);
    buffer.writeUInt8(voteByte, i / 4);
  }
  return buffer;
}
