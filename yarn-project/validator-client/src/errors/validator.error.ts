import { type TxHash } from '@aztec/circuit-types/tx_hash';

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
  constructor(numberOfRequiredAttestations: number, slot: bigint) {
    super(`Timeout waiting for ${numberOfRequiredAttestations} attestations for slot, ${slot}`);
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

export class BlockBuilderNotProvidedError extends ValidatorError {
  constructor() {
    super('Block builder not provided');
  }
}
