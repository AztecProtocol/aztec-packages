import { sumBigint } from '@aztec/foundation/bigint';
import { EthAddress } from '@aztec/foundation/eth-address';

import type { Offense, ValidatorSlashVote } from './types.js';

/**
 * Creates a consensus-slash vote for a given set of committees based on a set of Offenses
 * @param offenses - Array of offenses to consider
 * @param committees - Array of committees (each containing array of validator addresses)
 * @param settings - Settings including slashingAmounts and optional validator override lists
 * @returns Array of ValidatorSlashVote, where each vote is how many slash units the validator in that position should be slashed
 */
export function getSlashConsensusVotesFromOffenses(
  offenses: Pick<Offense, 'validator' | 'amount'>[],
  committees: EthAddress[][],
  settings: {
    slashingAmounts: [bigint, bigint, bigint];
  },
): ValidatorSlashVote[] {
  const { slashingAmounts } = settings;

  const slashedSet: Set<string> = new Set();

  const votes = committees.flatMap(committee =>
    committee.map(validator => {
      const validatorStr = validator.toString();

      // If already voted for slashing this validator, skip
      if (slashedSet.has(validatorStr)) {
        return 0;
      }

      // Normal offense-based slashing logic
      const validatorOffenses = offenses.filter(o => o.validator.equals(validator));
      const slashAmount = sumBigint(validatorOffenses.map(o => o.amount));
      const slashUnits = getSlashUnitsForAmount(slashAmount, slashingAmounts);
      slashedSet.add(validatorStr);
      return Number(slashUnits);
    }),
  );
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
