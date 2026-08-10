import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TxHash } from '@aztec/stdlib/tx';

export class ValidatorError extends Error {
  constructor(message: string) {
    super(`Validator Error: ${message}`);
  }
}

export class InvalidValidatorPrivateKeyError extends ValidatorError {
  constructor() {
    super('Invalid validator private key provided');
  }
}

export class AttestationTimeoutError extends ValidatorError {
  constructor(
    public readonly collectedCount: number,
    public readonly requiredCount: number,
    public readonly slot: SlotNumber,
  ) {
    super(`Timeout collecting attestations for slot ${slot}: ${collectedCount}/${requiredCount}`);
  }
}

export class TransactionsNotAvailableError extends ValidatorError {
  constructor(txHashes: TxHash[]) {
    super(`Transactions not available: ${txHashes.join(', ')}`);
  }
}

/**
 * Thrown when a tx carried in a block proposal fails minimum integrity validation (metadata, size, data,
 * contract instances, or proof). The proposer signs both the tx hashes and the tx objects, so this is
 * proposer misbehavior rather than a local failure, and callers classify it as an invalid block proposal.
 */
export class InvalidBlockProposalTxsError extends ValidatorError {
  constructor(public readonly invalidTxs: { txHash: TxHash; reasons: string[] }[]) {
    super(
      `Invalid txs in block proposal: ${invalidTxs
        .map(({ txHash, reasons }) => `${txHash} (${reasons.join(', ')})`)
        .join('; ')}`,
    );
    // Set so `isErrorClass` can recognize this error across package instances, where `instanceof` fails.
    this.name = 'InvalidBlockProposalTxsError';
  }
}

export class FailedToReExecuteTransactionsError extends ValidatorError {
  constructor(txHashes: TxHash[]) {
    super(`Failed to re-execute transactions: ${txHashes.join(', ')}`);
  }
}

export class ReExInitialStateMismatchError extends ValidatorError {
  constructor(
    public readonly expectedArchiveRoot: Fr,
    public readonly actualArchiveRoot: Fr,
  ) {
    super('Re-execution initial state mismatch');
  }
}

export class ReExStateMismatchError extends ValidatorError {
  constructor(
    public readonly expectedArchiveRoot: Fr,
    public readonly actualArchiveRoot: Fr,
  ) {
    super('Re-execution state mismatch');
  }
}

export class ReExFailedTxsError extends ValidatorError {
  constructor(numFailedTxs: number) {
    super(`Re-execution failed to process ${numFailedTxs} txs`);
  }
}

export class ReExTimeoutError extends ValidatorError {
  constructor() {
    super('Re-execution timed out or failed to process all txs in the proposal');
  }
}
