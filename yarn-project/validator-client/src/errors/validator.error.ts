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
