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
    public readonly slot: bigint,
  ) {
    super(`Timeout collecting attestations for slot ${slot}: ${collectedCount}/${requiredCount}`);
  }
}

export class TransactionsNotAvailableError extends ValidatorError {
  constructor(txHashes: TxHash[]) {
    super(`Transactions not available: ${txHashes.join(', ')}`);
  }
}

export class FailedToReExecuteTransactionsError extends ValidatorError {
  constructor(txHashes: TxHash[]) {
    super(`Failed to re-execute transactions: ${txHashes.join(', ')}`);
  }
}

export class ReExStateMismatchError extends ValidatorError {
  constructor() {
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
