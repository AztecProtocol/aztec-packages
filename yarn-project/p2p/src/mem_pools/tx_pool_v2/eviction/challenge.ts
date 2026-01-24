import type { TxMetaData } from '../tx_metadata.js';

/**
 * Result of a challenge between two transactions competing for the same resource
 * (e.g., conflicting nullifiers).
 */
export type ChallengeResult = {
  /** Whether the incoming transaction wins the challenge */
  incomingWins: boolean;
  /** Reason for the outcome */
  reason: string;
};

/**
 * Resolves a challenge between an incoming transaction and an existing transaction.
 * The transaction with the higher priority fee wins. On ties, the existing transaction wins.
 *
 * @param incoming - Metadata of the incoming transaction
 * @param existing - Metadata of the existing transaction
 * @returns Result indicating which transaction wins and why
 */
export function resolveChallenge(incoming: TxMetaData, existing: TxMetaData): ChallengeResult {
  if (incoming.priorityFee > existing.priorityFee) {
    return {
      incomingWins: true,
      reason: `incoming has higher fee (${incoming.priorityFee} > ${existing.priorityFee})`,
    };
  }

  if (incoming.priorityFee < existing.priorityFee) {
    return {
      incomingWins: false,
      reason: `existing has higher fee (${existing.priorityFee} > ${incoming.priorityFee})`,
    };
  }

  // Tie goes to existing transaction
  return {
    incomingWins: false,
    reason: `tie on fee (${incoming.priorityFee}), existing wins`,
  };
}

/**
 * Checks if an incoming transaction can win a challenge against an existing transaction.
 * This is a quick check without the full result details.
 *
 * @param incomingPriorityFee - Priority fee of the incoming transaction
 * @param existingPriorityFee - Priority fee of the existing transaction
 * @returns True if the incoming transaction would win
 */
export function canWinChallenge(incomingPriorityFee: bigint, existingPriorityFee: bigint): boolean {
  return incomingPriorityFee > existingPriorityFee;
}
