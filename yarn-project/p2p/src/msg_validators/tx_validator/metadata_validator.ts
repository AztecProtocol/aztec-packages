import { type AnyTx, Tx, type TxValidationResult, type TxValidator } from '@aztec/circuit-types';
import { type Fr } from '@aztec/circuits.js';
import { createLogger } from '@aztec/foundation/log';

export class MetadataTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:tx_metadata');

  constructor(private chainId: Fr, private blockNumber: Fr) {}

  validateTx(tx: T): Promise<TxValidationResult> {
    const errors = [];
    if (!this.#hasCorrectChainId(tx)) {
      errors.push('Incorrect chain id');
    }
    if (!this.#isValidForBlockNumber(tx)) {
      errors.push('Invalid block number');
    }
    return Promise.resolve(errors.length > 0 ? { result: 'invalid', reason: errors } : { result: 'valid' });
  }

  #hasCorrectChainId(tx: T): boolean {
    if (!tx.data.constants.txContext.chainId.equals(this.chainId)) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(
          tx,
        )} because of incorrect chain ${tx.data.constants.txContext.chainId.toNumber()} != ${this.chainId.toNumber()}`,
      );
      return false;
    } else {
      return true;
    }
  }

  #isValidForBlockNumber(tx: T): boolean {
    const maxBlockNumber = tx.data.rollupValidationRequests.maxBlockNumber;

    if (maxBlockNumber.isSome && maxBlockNumber.value < this.blockNumber) {
      this.#log.warn(
        `Rejecting tx ${Tx.getHash(tx)} for low max block number. Tx max block number: ${
          maxBlockNumber.value
        }, current block number: ${this.blockNumber}.`,
      );
      return false;
    } else {
      return true;
    }
  }
}
