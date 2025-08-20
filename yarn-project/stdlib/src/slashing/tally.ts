import { minBigint, sumBigint } from '@aztec/foundation/bigint';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { Offense, ValidatorSlashVote } from './types.js';

/** How many slashing units a validator can be slashed in consensus-based slashing */
const MAX_SLASH_UNITS_PER_VALIDATOR = 15n;

/**
 * Creates a consensus-slash vote for a given set of committees based on a set of Offenses
 * @returns Array of ValidatorSlashVote, where each vote is how many slash units the validator in that position should be slashed
 */
export function getSlashConsensusVotesFromOffenses(
  offenses: Offense[],
  committees: EthAddress[][],
  settings: { slashingUnit: bigint },
): ValidatorSlashVote[] {
  const { slashingUnit } = settings;
  const slashed: Set<string> = new Set();
  const votes = committees.flatMap(committee =>
    committee.map(validator => {
      if (slashed.has(validator.toString())) {
        return 0; // Already voted for slashing this validator
      }
      const validatorOffenses = offenses.filter(o => o.validator.equals(validator));
      const slashAmount = sumBigint(validatorOffenses.map(o => o.amount));
      const slashUnits = minBigint(slashAmount / slashingUnit, MAX_SLASH_UNITS_PER_VALIDATOR);
      slashed.add(validator.toString());
      return Number(slashUnits);
    }),
  );
  return votes;
}

/**
 * Encodes a set of slash votes into a Buffer for use in a consensus slashing vote transaction.
 * Each vote is represented as a 4-bit value, which represents how many slashing units the validator should be slashed.
 * @param votes - The array of slash votes to encode
 * @returns A Buffer containing the encoded slash votes
 */
export function encodeSlashConsensusVotes(votes: ValidatorSlashVote[]): Buffer {
  if (votes.length % 2 !== 0) {
    throw new Error('Votes array must have an even length');
  }
  const buffer = Buffer.alloc(votes.length / 2);
  for (let i = 0; i < votes.length; i += 2) {
    const voteByte = (votes[i] << 4) | votes[i + 1]; // Combine two votes into one byte
    buffer.writeUInt8(voteByte, i / 2);
  }
  return buffer;
}
